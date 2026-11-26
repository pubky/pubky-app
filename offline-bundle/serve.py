#!/usr/bin/env python3
"""Serves the Pubky App offline bundle on http://127.0.0.1:<port>. Usage: python3 serve.py [--port N] [--no-browser]"""
import http.server
import json
import os
import re
import sys
import urllib.parse
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, 'app')
with open(os.path.join(ROOT, 'routes.json'), encoding='utf-8') as f:
    ROUTES = json.load(f)

TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    # React Server Component payloads; the client router accepts them as text/plain.
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
}


def pattern(route):
    # `*` is one path segment; it stops at a dot so `/post/a/b.txt` keeps its `.txt`.
    return re.compile('^' + re.escape(route).replace(r'\*', '([^/.]+)') + '(?=$|[/.])')


DYNAMIC = [(pattern(r), r.replace('*', ROUTES['placeholder'])) for r in ROUTES['dynamic']]
REDIRECTS = [(re.compile('^' + re.escape(src).replace(r'\*', '([^/]+)') + '$'), dst) for src, dst in ROUTES['redirects']]


def find_file(path):
    base = os.path.normpath(os.path.join(APP, path.lstrip('/')))
    if base != APP and not base.startswith(APP + os.sep):
        return None
    for candidate in (base, base + '.html', os.path.join(base, 'index.html')):
        if os.path.isfile(candidate):
            return candidate
    return None


def resolve(path):
    """Returns (status, file or redirect target)."""
    if any(path.startswith(prefix) for prefix in ROUTES['notFound']):
        return 404, None
    for regex, dst in REDIRECTS:
        match = regex.match(path)
        if match:
            target = dst
            for value in match.groups():
                target = target.replace('*', value, 1)
            return 308, target
    found = find_file(path)
    if found:
        return 200, found
    # Every id of a dynamic route is served the one page the export holds for it, and so are its
    # payload files (`/post/a/b.txt`, `/post/a/b/__next...txt`); the app reads the ids from the URL.
    for regex, replacement in DYNAMIC:
        if regex.match(path):
            found = find_file(regex.sub(replacement, path, count=1))
            if found:
                return 200, found
    return 404, None


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'PubkyOffline'

    def do_GET(self):
        self.respond(body=True)

    def do_HEAD(self):
        self.respond(body=False)

    def do_POST(self):
        self.send_error(405)

    def respond(self, body):
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        status, target = resolve(path)
        if status == 308:
            self.send_response(308)
            self.send_header('Location', target)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if status == 404:
            target = find_file('/404')
            if not target:
                self.send_error(404)
                return
        with open(target, 'rb') as f:
            data = f.read()
        self.send_response(status)
        self.send_header('Content-Type', TYPES.get(os.path.splitext(target)[1].lower(), 'application/octet-stream'))
        self.send_header('Content-Length', str(len(data)))
        immutable = path.startswith('/_next/static/') and status == 200
        self.send_header('Cache-Control', 'public, max-age=31536000, immutable' if immutable else 'no-cache')
        self.end_headers()
        if body:
            self.wfile.write(data)

    def log_message(self, *args):
        pass


class Server(http.server.ThreadingHTTPServer):
    # On Windows, address reuse lets a second server bind a port that is already taken.
    allow_reuse_address = os.name != 'nt'


def main():
    args = sys.argv[1:]
    port = int(args[args.index('--port') + 1]) if '--port' in args else ROUTES['port']
    url = f'http://127.0.0.1:{port}/'
    try:
        server = Server(('127.0.0.1', port), Handler)
    except OSError:
        # Another port is another origin, which would hide the session and the local index.
        sys.exit(f'Port {port} is busy. Close the program using it (or another copy of Pubky App) and try again.')
    print(f'Pubky App is running at {url}  (press Ctrl+C to stop)')
    if '--no-browser' not in args:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
