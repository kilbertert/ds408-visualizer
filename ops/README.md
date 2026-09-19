# 部署

应用零第三方依赖（见 `requirements.txt`），只用 Python 标准库，因此目标机不需要虚拟环境，
也不需要构建步骤——部署就是分发源码。

```bash
ops/deploy.sh              # 发布当前 HEAD
ops/deploy.sh --ref <ref>  # 发布指定 ref
```

## 目标形态（service host）

| 项 | 值 |
| --- | --- |
| 主机 | service host `8.138.202.79` |
| 系统账号 | `ds408`（system、nologin、无 sudo、无附加组） |
| 安装路径 | `/opt/ds408-visualizer/app`，上一个版本留在 `app.old` |
| 监听 | `0.0.0.0:18511`（service host 端口池 `15000-19999`） |
| 防火墙 | ufw 仅放行 `154.9.24.30` 访问 `18511/tcp` |
| 单元 | `ops/ds408-visualizer.service` → `/etc/systemd/system/` |

## 入口链路（过渡形态）

```
ds408.ranlei.work → Cloudflare → development host nginx:443 → frps:8188
                  → frpc（localIP = 8.138.202.79, localPort = 18511）→ service host
```

入口层暂时留在 development host，service host 不加入任何 overlay、也不对外开放入站
（除放行给 development host 的这一个端口）。这是多机模型"先搬服务、最后一次性迁入口"的
过渡形态；终局是把入口换成 service host 上的 Cloudflare Tunnel（纯出站），届时
frps/frpc/回源证书一并退役。

回源这一跳跨越公网明文 HTTP。本站内容为公开的考研复习资料，不含凭据或个人数据，
因此过渡期接受；若日后站点携带敏感内容，必须先给这一跳加密。

## 回滚

1. 把 development host 的 `~/.config/frp/ds408.toml` 改回 `localIP = 127.0.0.1`、
   `localPort = 8511`，并 `systemctl --user restart ds408-frp`（旧实例当时仍在本机运行）。
2. 或直接在 service host 上 `systemctl stop ds408-visualizer`，并把 `/opt/ds408-visualizer/app.old` 换回 `app`。

## 验证

部署脚本自身会在目标机上请求 `http://127.0.0.1:18511/api/topics` 做就绪自检。
发布后还应从外部确认隧道入口：`curl -sI https://ds408.ranlei.work/`。
