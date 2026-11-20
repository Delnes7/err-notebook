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
from urllib.parse import urlsplit, unquote

PORT = 8000
project_dir = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Only publish the application assets, never project files or directories.
        relative = unquote(urlsplit(path).path).lstrip('/') or 'index.html'
        allowed = relative == 'index.html' or (
            relative.startswith(('js/', 'css/'))
            and all(part not in ('', '.', '..') and not part.startswith('.') for part in relative.split('/'))
        )
        if not allowed:
            return os.path.join(project_dir, '__not_found__')
        resolved = os.path.realpath(os.path.join(project_dir, relative))
        asset_root = os.path.realpath(os.path.join(project_dir, relative.split('/')[0]))
        if relative != 'index.html' and os.path.commonpath([resolved, asset_root]) != asset_root:
            return os.path.join(project_dir, '__not_found__')
        return resolved

    def end_headers(self):
        # 禁用本地缓存，确保修改立即生效
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    # 切换至项目所在目录
    global project_dir
    project_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_dir)

    # 尝试绑定端口，如果 8000 被占用则顺延
    port = PORT
    httpd = None
    for p in range(PORT, PORT + 20):
        try:
            httpd = socketserver.TCPServer(("127.0.0.1", p), Handler)
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

