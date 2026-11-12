#!/data/data/com.termux/files/usr/bin/python
"""Uper → Termux 수신 서버

유튜브 페이지의 Uper 버튼이 http://127.0.0.1:8765/send?url=... 로 영상 주소를 보내면
~/bin/termux-url-opener 를 실행해서 공유창 없이 바로 저장한다.

- 휴대폰 안에서만 접속 가능 (127.0.0.1)
- Uper가 붙이는 X-Uper 헤더가 있는 요청만 받음 (다른 웹페이지가 함부로 부르지 못하게)
- https://www.youtube.com/watch?v=영상ID 형태의 주소만 받음
"""
import http.server
import os
import re
import subprocess
import urllib.parse
from datetime import datetime

HOST = '127.0.0.1'
PORT = 8765
OPENER = os.path.expanduser('~/bin/termux-url-opener')
LOG = os.path.expanduser('~/uper-server.log')
ALLOWED = re.compile(r'^https://www\.youtube\.com/watch\?v=[\w-]{11}$')


def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(f'{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n')


class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self, code, text):
        body = text.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/ping':
            return self.reply(200, 'ok')
        if u.path != '/send':
            return self.reply(404, 'not found')
        if self.headers.get('X-Uper') != '1':
            return self.reply(403, 'forbidden')
        url = urllib.parse.parse_qs(u.query).get('url', [''])[0]
        if not ALLOWED.match(url):
            log(f'거부: {url!r}')
            return self.reply(400, 'bad url')
        if not os.access(OPENER, os.X_OK):
            log(f'실행 불가: {OPENER}')
            return self.reply(500, 'termux-url-opener not found')
        out = open(LOG, 'a', encoding='utf-8')
        subprocess.Popen([OPENER, url], stdout=out, stderr=out, start_new_session=True)
        log(f'시작: {url}')
        return self.reply(200, 'ok')

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    log(f'서버 시작 {HOST}:{PORT}')
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
