#!/usr/bin/env python3
"""
server.py - 智慧错题本本地轻量启动服务器
启动本地 HTTP 服务并在默认浏览器中自动打开错题本页面。
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8000

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 禁用本地缓存，确保修改立即生效
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    # 切换至项目所在目录
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    # 尝试绑定端口，如果 8000 被占用则顺延
    port = PORT
    httpd = None
    for p in range(PORT, PORT + 20):
        try:
            httpd = socketserver.TCPServer(("", p), Handler)
            port = p
            break
        except OSError:
            continue

    if not httpd:
        print("❌ 无法绑定可用端口，请检查端口占用情况。")
        sys.exit(1)

    url = f"http://localhost:{port}"
    print(f"\n=======================================================")
    print(f"📖 智慧错题本 (Error Notebook) 本地服务已启动！")
    print(f"🌐 本地访问地址: {url}")
    print(f"💡 浏览器正在自动打开... (按 Ctrl+C 停止服务)")
    print(f"=======================================================\n")

    try:
        webbrowser.open(url)
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n🛑 服务已停止。")
        httpd.server_close()

if __name__ == "__main__":
    main()

