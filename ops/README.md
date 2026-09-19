# 部署

应用零第三方依赖（见 `requirements.txt`），只用 Python 标准库，因此部署不需要虚拟环境。

## 现役部署

| 项 | 值 |
| --- | --- |
| 主机 | development host（`claude` user unit） |
| 单元 | `ops/ds408-visualizer.service` → `~/.config/systemd/user/` |
| 监听 | `127.0.0.1:8511`（`8511` 是策略前既有例外，见开发机端口注册表） |
| 对外入口 | frp 隧道 `ds408.ranlei.work`（frpc `localIP = 127.0.0.1`） |

对全网直连的 `154.9.24.30:8511` 已于 2026-09-19 收敛为仅环回；隧道入口不受影响。

## 待办

按多机开发模型，本服务是搬迁到 service host 的候选：目标形态为独立系统账号 + 系统级 unit +
服务机端口池 `15000-19999` 内的分配，dev 机只保留入口。此处记录现役形态，搬迁时更新本文件。
