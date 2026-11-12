#!/data/data/com.termux/files/usr/bin/python
"""Uper → Termux 수신 서버

유튜브 페이지의 Uper 버튼이 http://127.0.0.1:8765/send?url=...&format=mp3|mp4 로 영상 주소를 보내면
yt-dlp로 공유창 없이 바로 저장한다.
- mp3: 음악만 MP3로 → MUSIC_DIR
- mp4: 영상 MP4로   → VIDEO_DIR
- format이 없으면(예전 Uper) 기존 ~/bin/termux-url-opener 를 그대로 실행

- 휴대폰 안에서만 접속 가능 (127.0.0.1)
- Uper가 붙이는 X-Uper 헤더가 있는 요청만 받음 (다른 웹페이지가 함부로 부르지 못하게)
- https://www.youtube.com/watch?v=영상ID 형태의 주소만 받음
"""
import http.server
import os
import re
import shutil
import subprocess
import threading
import urllib.parse
from datetime import datetime

HOST = '127.0.0.1'
PORT = 8765
OPENER = os.path.expanduser('~/bin/termux-url-opener')
LOG = os.path.expanduser('~/uper-server.log')
ALLOWED = re.compile(r'^https://www\.youtube\.com/watch\?v=[\w-]{11}$')
MUSIC_DIR = '/sdcard/노래'
VIDEO_DIR = '/sdcard/Movies'
NAME = '%(title)s [%(id)s].%(ext)s'


def command(fmt, url):
    ytdlp = shutil.which('yt-dlp') or 'yt-dlp'
    if fmt == 'mp3':
        return [ytdlp, '-x', '--audio-format', 'mp3', '--audio-quality', '0',
                '--embed-thumbnail', '--add-metadata', '--no-playlist',
                '--print', 'after_move:UPER_FILE %(filepath)s', '--no-simulate',
                '-o', os.path.join(MUSIC_DIR, NAME), url]
    if fmt == 'mp4':
        return [ytdlp, '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
                '--merge-output-format', 'mp4', '--no-playlist',
                '--print', 'after_move:UPER_FILE %(filepath)s', '--no-simulate',
                '-o', os.path.join(VIDEO_DIR, NAME), url]
    return [OPENER, url]


def media_scan(path):
    """새 파일을 안드로이드 미디어 목록에 등록해야 삼성뮤직·갤러리에 바로 보인다.
    (Termux가 직접 쓴 파일은 자동으로 등록되지 않음)"""
    if shutil.which('termux-media-scan'):           # pkg install termux-api + Termux:API 앱
        r = subprocess.run(['termux-media-scan', path], capture_output=True, text=True)
        log(f'미디어 등록(termux-media-scan) {r.returncode}: {path}')
        if r.returncode == 0:
            return
    # Termux:API가 없을 때: 안드로이드 미디어 스캐너에 직접 알림
    uri = 'file://' + urllib.parse.quote(path)
    r = subprocess.run(['am', 'broadcast', '--user', '0', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
                        '-d', uri], capture_output=True, text=True)
    log(f'미디어 등록(am broadcast) {r.returncode}: {path}')


def run_download(cmd):
    """yt-dlp 실행 → 끝난 파일을 미디어 목록에 등록"""
    with open(LOG, 'a', encoding='utf-8') as out:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=out, text=True, start_new_session=True)
        files = []
        for line in p.stdout:
            if line.startswith('UPER_FILE '):
                files.append(line[len('UPER_FILE '):].strip())
            else:
                out.write(line)
        p.wait()
    log(f'끝 (코드 {p.returncode}): {files or "파일 없음"}')
    for f in files:
        if os.path.exists(f):
            media_scan(f)


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
            return self.reply(200, 'ok v2')
        if u.path != '/send':
            return self.reply(404, 'not found')
        if self.headers.get('X-Uper') != '1':
            return self.reply(403, 'forbidden')
        q = urllib.parse.parse_qs(u.query)
        url = q.get('url', [''])[0]
        fmt = q.get('format', [''])[0]
        if not ALLOWED.match(url):
            log(f'거부: {url!r}')
            return self.reply(400, 'bad url')
        if fmt not in ('', 'mp3', 'mp4'):
            return self.reply(400, 'bad format')
        cmd = command(fmt, url)
        if fmt:
            if not shutil.which('yt-dlp'):
                log('yt-dlp 없음')
                return self.reply(500, 'yt-dlp not found')
            os.makedirs(MUSIC_DIR if fmt == 'mp3' else VIDEO_DIR, exist_ok=True)
        elif not os.access(OPENER, os.X_OK):
            log(f'실행 불가: {OPENER}')
            return self.reply(500, 'termux-url-opener not found')
        if fmt:
            threading.Thread(target=run_download, args=(cmd,), daemon=True).start()
        else:
            out = open(LOG, 'a', encoding='utf-8')
            subprocess.Popen(cmd, stdout=out, stderr=out, start_new_session=True)
        log(f'시작({fmt or "opener"}): {url}')
        return self.reply(200, 'ok ' + (fmt or 'opener'))

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    log(f'서버 시작 {HOST}:{PORT}')
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
