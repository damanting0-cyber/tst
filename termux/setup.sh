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
command -v termux-media-scan >/dev/null || pkg install -y termux-api   # 받은 파일을 삼성뮤직·갤러리에 등록

# Termux를 열 때마다 서버가 꺼져 있으면 자동으로 켬.
# 예전 버전이 넣은 블록(termux-wake-lock 포함)은 지우고 새로 씀:
# wake-lock은 화면이 꺼져도 CPU를 깨워 둬서 배터리를 많이 씀. 서버는 기다리는 동안 CPU를 쓰지 않음.
touch ~/.bashrc
sed -i '/# uper-server autostart/,/^fi$/d' ~/.bashrc
printf '%s\n' \
  '# uper-server autostart' \
  'if ! pgrep -f uper-server.py >/dev/null; then' \
  '  nohup python ~/bin/uper-server.py >/dev/null 2>&1 &' \
  'fi' >> ~/.bashrc

# 새 버전으로 다시 켜기 (예전 wake-lock도 풀기)
termux-wake-unlock 2>/dev/null || true
pkill -f uper-server.py 2>/dev/null || true
sleep 0.5
nohup python ~/bin/uper-server.py >/dev/null 2>&1 &
sleep 1
curl -s http://127.0.0.1:8765/ping && echo "  ← Uper 서버 실행 중"
