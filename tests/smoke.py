"""可跑的检查：在临时端口起服务，断言首页与 /api/topics 真的能服务。

    python3 tests/smoke.py

纯标准库，不需要安装任何依赖（应用本身零第三方依赖）。
"""
from __future__ import annotations

import os
import sys
import threading
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app  # noqa: E402


def fetch(url: str) -> tuple[int, str]:
    with urllib.request.urlopen(url, timeout=5) as response:
        return response.status, response.read().decode("utf-8", "replace")


def main() -> int:
    os.chdir(app.BASE_DIR)  # 与 app.main() 一致：静态文件按仓库根解析
    server = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        status, body = fetch(f"{base}/")
        assert status == 200, f"GET / -> {status}"
        assert "<html" in body.lower(), f"GET / 不是 HTML：{body[:120]!r}"

        status, body = fetch(f"{base}/api/topics")
        assert status == 200, f"GET /api/topics -> {status}"
        assert '"sorting"' in body, f"/api/topics 缺 排序 主题：{body[:120]!r}"
    finally:
        server.shutdown()
    print("smoke ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
