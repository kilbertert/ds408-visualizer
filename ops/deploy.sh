#!/bin/bash
# 发布 ds408-visualizer 到 service host。
#   ops/deploy.sh [--host root@8.138.202.79] [--ref <git-ref>]
#
# 应用零第三方依赖，因此不需要在目标机构建；打包源码即可。
# 对外入口仍留在 development host 的 frp 隧道（过渡形态），本脚本只负责应用实例。
set -euo pipefail

HOST=root@8.138.202.79
REF=$(git rev-parse HEAD)
DEV_HOST_IP=154.9.24.30        # 只放行 development host 访问服务端口
PORT=18511                     # service host 端口池 15000-19999
APP_ROOT=/opt/ds408-visualizer
SERVICE_USER=ds408
SERVICE=ds408-visualizer

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --ref)  REF="$2";  shift 2 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

echo "==> 打包 $REF"
git -C "$ROOT" archive --format=tar.gz -o "$STAGE/app.tar.gz" "$REF"
cp "$ROOT/ops/$SERVICE.service" "$STAGE/$SERVICE.service"

echo "==> 上传"
scp -q "$STAGE/app.tar.gz" "$STAGE/$SERVICE.service" "$HOST:/tmp/"

echo "==> 上线（$HOST）"
ssh "$HOST" bash -s <<REMOTE
set -euo pipefail
APP=$APP_ROOT/app

if ! id -u $SERVICE_USER >/dev/null 2>&1; then
  adduser --system --group --no-create-home --home $APP_ROOT $SERVICE_USER
fi
install -d -m 755 -o $SERVICE_USER -g $SERVICE_USER $APP_ROOT

rm -rf "\$APP".new; mkdir -p "\$APP".new
tar xzf /tmp/app.tar.gz -C "\$APP".new
if [ -d "\$APP" ]; then rm -rf "\$APP".old; mv "\$APP" "\$APP".old; fi
mv "\$APP".new "\$APP"
chown -R $SERVICE_USER:$SERVICE_USER "\$APP"

install -m 644 /tmp/$SERVICE.service /etc/systemd/system/$SERVICE.service
ufw allow from $DEV_HOST_IP to any port $PORT proto tcp >/dev/null
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null 2>&1 || true
systemctl restart "$SERVICE"

for _ in \$(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/topics" >/dev/null; then
    echo "自检通过 http://127.0.0.1:$PORT/api/topics (\$(systemctl is-active $SERVICE))"
    exit 0
  fi
  sleep 1
done
echo "自检失败：$SERVICE 未在 30s 内就绪" >&2
systemctl status "$SERVICE" --no-pager -n 20 >&2 || true
exit 1
REMOTE

echo "==> 完成：unit=$SERVICE port=$PORT 安装于 $APP_ROOT"
