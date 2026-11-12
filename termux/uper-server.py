#!/data/data/com.termux/files/usr/bin/python
"""Uper → Termux 다운로드 서버

유튜브 페이지의 Uper 다운 버튼이 보내는 요청을 받아 yt-dlp로 공유창 없이 바로 저장한다.
  GET /send?url=...&format=mp3|mp4   다운로드 시작 → {"id": ...}
  GET /status                         진행 중·최근 다운로드 목록 (진행률)
  GET /history                        지금까지 받은 기록 (최근 100개)
  GET /ping                           살아 있는지 확인

- m4a: 음악만, 유튜브 원본 소리를 변환 없이 M4A로 → MUSIC_DIR (mp3도 받음: 변환함)
- mp4: 영상 MP4로 → VIDEO_DIR
- 끝난 파일은 미디어 목록에 등록 (삼성뮤직·갤러리에 바로 보이게)
- 휴대폰 안에서만 접속 가능 (127.0.0.1), Uper가 붙이는 X-Uper 헤더가 있는 요청만 받음
- https://www.youtube.com/watch?v=영상ID 형태의 주소만 받음
"""
import http.server
import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.parse
from datetime import datetime

HOST = '127.0.0.1'
PORT = 8765
LOG = os.path.expanduser('~/uper-server.log')
HISTORY = os.path.expanduser('~/uper-history.jsonl')
ALLOWED = re.compile(r'^https://www\.youtube\.com/watch\?v=[\w-]{11}$')
MUSIC_DIR = '/sdcard/노래'
VIDEO_DIR = '/sdcard/Movies'
NAME = '%(title)s [%(id)s].%(ext)s'
KEEP_DONE_SEC = 120          # 끝난 항목을 목록에 남겨 두는 시간

jobs = {}                    # id → 상태
jobs_lock = threading.Lock()
next_id = [0]


def log(msg):
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(f'{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n')


def command(fmt, url):
    ytdlp = shutil.which('yt-dlp') or 'yt-dlp'
    common = ['--no-playlist', '--newline', '--progress', '--no-simulate',
              '--print', 'video:UPER_INFO %(title)s',          # 정보 확인 끝 (다음: 섬네일 받기)
              '--print', 'before_dl:UPER_TITLE %(title)s',     # 섬네일까지 받음 (다음: 본 파일 받기)
              '--print', 'after_move:UPER_FILE %(filepath)s',
              '--progress-template', 'download:UPER_PROG %(progress._percent_str)s|%(progress._eta_str)s|%(progress._speed_str)s',
              '--progress-template', 'postprocess:UPER_PP %(progress.postprocessor)s']
    # 유튜브는 이제 JavaScript 실행기가 있어야 모든 형식을 제대로 줌 (없으면 경고 + 일부 형식 누락)
    if shutil.which('deno'):
        common += ['--js-runtimes', 'deno']
    elif shutil.which('node'):
        common += ['--js-runtimes', 'node']
    if fmt == 'm4a':
        # 유튜브의 AAC(m4a) 소리를 그대로 저장 → 다시 압축하지 않아 빠르고 음질 손실 없음
        return [ytdlp, '-f', 'ba[ext=m4a]/ba', '-x', '--audio-format', 'm4a',
                '--embed-thumbnail', '--add-metadata', *common,
                '-o', os.path.join(MUSIC_DIR, NAME), url]
    if fmt == 'mp3':
        return [ytdlp, '-x', '--audio-format', 'mp3', '--audio-quality', '0',
                '--embed-thumbnail', '--add-metadata', *common,
                '-o', os.path.join(MUSIC_DIR, NAME), url]
    return [ytdlp, '-f', 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
            '--merge-output-format', 'mp4', *common,
            '-o', os.path.join(VIDEO_DIR, NAME), url]


def media_scan(path):
    """Termux가 직접 쓴 파일은 자동 등록되지 않아서 미디어 목록에 알려 줌"""
    if shutil.which('termux-media-scan'):           # termux-api 패키지 + Termux:API 앱
        r = subprocess.run(['termux-media-scan', path], capture_output=True, text=True)
        log(f'미디어 등록(termux-media-scan) {r.returncode}: {path}')
        if r.returncode == 0:
            return
    uri = 'file://' + urllib.parse.quote(path)
    r = subprocess.run(['am', 'broadcast', '--user', '0', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
                        '-d', uri], capture_output=True, text=True)
    log(f'미디어 등록(am broadcast) {r.returncode}: {path}')


# 단계: 형식별 순서 (Uper 카드의 체크리스트와 같은 이름)
STAGES = {
    'm4a': ['info', 'thumb', 'dl', 'meta', 'embed', 'save', 'done'],
    'mp3': ['info', 'thumb', 'dl', 'meta', 'embed', 'save', 'done'],
    'mp4': ['info', 'dl', 'audio', 'merge', 'save', 'done'],
}
PP_STAGE = {
    'ExtractAudio': 'meta', 'FFmpegExtractAudio': 'meta', 'Metadata': 'meta', 'FFmpegMetadata': 'meta',
    'EmbedThumbnail': 'embed', 'Merger': 'merge', 'FFmpegMerger': 'merge', 'MoveFiles': 'save',
}


def advance(job, stage):
    """단계는 앞으로만 진행"""
    order = STAGES[job['format']]
    if stage in order and order.index(stage) > order.index(job['stage']):
        update(job, stage=stage)


def update(job, **kw):
    with jobs_lock:
        job.update(kw, updated=time.time())


def run_download(job, cmd):
    files = []
    last_err = ''
    with open(LOG, 'a', encoding='utf-8') as out:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             bufsize=1, start_new_session=True)
        for raw in p.stdout:
            line = raw.strip()
            if line.startswith('UPER_PROG '):
                pct, eta, speed = (line[10:].split('|') + ['', '', ''])[:3]
                try:
                    pv = float(pct.strip().rstrip('%'))
                except ValueError:
                    pv = None
                if pv is not None and job['percent'] is not None and pv + 5 < job['percent']:
                    update(job, part=job['part'] + 1)        # MP4: 영상 → 소리 두 번째 파일
                update(job, status='downloading', percent=pv, eta=eta.strip(), speed=speed.strip())
                advance(job, 'audio' if job['format'] == 'mp4' and job['part'] > 1 else 'dl')
            elif line.startswith('UPER_PP '):
                name = line[8:].strip()
                update(job, status='converting')
                if name in PP_STAGE:
                    advance(job, PP_STAGE[name])
            elif line.startswith('UPER_INFO '):
                update(job, title=line[10:])
                advance(job, 'dl' if job['format'] == 'mp4' else 'thumb')
            elif line.startswith('UPER_TITLE '):
                update(job, title=line[11:])
                advance(job, 'dl')
            elif line.startswith('UPER_FILE '):
                files.append(line[10:])
            else:
                out.write(raw)
                if 'ERROR' in line:
                    last_err = line
        p.wait()
    log(f'끝 #{job["id"]} (코드 {p.returncode}): {files or "파일 없음"}')
    if p.returncode != 0 or not files:
        update(job, status='error', error=last_err or f'yt-dlp 종료 코드 {p.returncode}')
        add_history(job)
        return
    update(job, status='saving', percent=100.0)
    advance(job, 'save')
    for f in files:
        if os.path.exists(f):
            media_scan(f)
    update(job, status='done', file=os.path.basename(files[-1]))
    advance(job, 'done')
    add_history(job)


def add_history(job):
    item = {k: job.get(k) for k in ('url', 'format', 'title', 'status', 'file', 'error')}
    item['time'] = int(time.time())
    with jobs_lock, open(HISTORY, 'a', encoding='utf-8') as f:
        f.write(json.dumps(item, ensure_ascii=False) + '\n')


def read_history(limit=100):
    try:
        with open(HISTORY, encoding='utf-8') as f:
            lines = f.readlines()[-limit:]
    except FileNotFoundError:
        return []
    items = []
    for line in reversed(lines):
        try:
            items.append(json.loads(line))
        except ValueError:
            pass
    return items


def snapshot():
    now = time.time()
    with jobs_lock:
        for k in [k for k, j in jobs.items()
                  if j['status'] in ('done', 'error') and now - j['updated'] > KEEP_DONE_SEC]:
            del jobs[k]
        return sorted((dict(j) for j in jobs.values()), key=lambda j: j['id'])


class Handler(http.server.BaseHTTPRequestHandler):
    def reply(self, code, data):
        body = (data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8' if not isinstance(data, str)
                         else 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/ping':
            return self.reply(200, 'ok v7')
        if self.headers.get('X-Uper') != '1':
            return self.reply(403, 'forbidden')
        if u.path == '/status':
            return self.reply(200, {'jobs': snapshot()})
        if u.path == '/history':
            return self.reply(200, {'items': read_history()})
        if u.path != '/send':
            return self.reply(404, 'not found')

        q = urllib.parse.parse_qs(u.query)
        url = q.get('url', [''])[0]
        fmt = q.get('format', ['m4a'])[0] or 'm4a'
        if not ALLOWED.match(url):
            log(f'거부: {url!r}')
            return self.reply(400, 'bad url')
        if fmt not in ('m4a', 'mp3', 'mp4'):
            return self.reply(400, 'bad format')
        if not shutil.which('yt-dlp'):
            log('yt-dlp 없음')
            return self.reply(500, 'yt-dlp not found')
        os.makedirs(VIDEO_DIR if fmt == 'mp4' else MUSIC_DIR, exist_ok=True)

        with jobs_lock:
            next_id[0] += 1
            job = {'id': next_id[0], 'url': url, 'format': fmt, 'title': '', 'status': 'starting',
                   'stage': 'info', 'percent': None, 'eta': '', 'speed': '', 'part': 1, 'file': '', 'error': '',
                   'updated': time.time()}
            jobs[job['id']] = job
        threading.Thread(target=run_download, args=(job, command(fmt, url)), daemon=True).start()
        log(f'시작 #{job["id"]} ({fmt}): {url}')
        return self.reply(200, {'id': job['id']})

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    log(f'서버 시작 {HOST}:{PORT}')
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
