#!/data/data/com.termux/files/usr/bin/bash
# Uper → Termux 서버 설치 (Termux에서 한 번만 실행)
#   curl -sL https://raw.githubusercontent.com/damanting0-cyber/tst/main/termux/setup.sh | bash
set -e
mkdir -p ~/bin
curl -sL -o ~/bin/uper-server.py https://raw.githubusercontent.com/damanting0-cyber/tst/main/termux/uper-server.py
chmod +x ~/bin/uper-server.py
command -v python >/dev/null || pkg install -y python
command -v ffmpeg >/dev/null || pkg install -y ffmpeg          # MP3 변환·MP4 합치기에 필요
command -v yt-dlp >/dev/null || pip install -U yt-dlp
[ -d ~/storage ] || termux-setup-storage                          # /sdcard 접근 권한

# Termux를 열 때마다 서버가 꺼져 있으면 자동으로 켬
MARK='# uper-server autostart'
if ! grep -q "$MARK" ~/.bashrc 2>/dev/null; then
  cat >> ~/.bashrc <<'EOF'
# uper-server autostart
if ! pgrep -f uper-server.py >/dev/null; then
  termux-wake-lock 2>/dev/null
  nohup python ~/bin/uper-server.py >/dev/null 2>&1 &
fi
EOF
fi

# 새 버전으로 다시 켜기
pkill -f uper-server.py 2>/dev/null || true
sleep 0.5
termux-wake-lock 2>/dev/null || true
nohup python ~/bin/uper-server.py >/dev/null 2>&1 &
sleep 1
curl -s http://127.0.0.1:8765/ping && echo "  ← Uper 서버 실행 중"
