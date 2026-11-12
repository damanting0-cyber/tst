# Uper

유튜브(모바일 웹)에서 영상을 꾹 누르면 섬네일 위에 팝업이 뜨는 유저스크립트입니다.

- **링크 복사** — 영상 주소를 클립보드에 복사
- **팁** — 영상을 팁 유리통에 담기
- **팁 유리통** — 오른쪽 아래 버튼. 담을수록 빨간색이 차오르고, 누르면 바텀시트로 목록이 열림
  - 왼쪽으로 스와이프하면 삭제, 스낵바에서 실행 취소
  - 손잡이를 아래로 끌거나 바깥을 누르면 닫힘
- 유튜브 다크/라이트 테마를 자동으로 따라감

## 설치

Tampermonkey에서 아래 주소를 열면 설치됩니다. 이후 새 버전은 자동으로 업데이트됩니다.

https://raw.githubusercontent.com/damanting0-cyber/tst/main/Uper.user.js

## 업데이트하는 법

`Uper.user.js`를 고친 뒤 맨 위의 `@version` 숫자를 올려서 커밋하면 됩니다. Tampermonkey는 버전이 올라갔을 때만 새로 받아요.

## Termux로 보내기 (음악 저장)

영상 페이지의 다운로드 버튼이나 꾹 누르기 팝업의 **Termux**를 누르면, 공유창 없이 바로 Termux의 `~/bin/termux-url-opener`가 실행됩니다.
이를 위해 Termux에서 작은 서버(`termux/uper-server.py`, 휴대폰 안에서만 접속 가능)가 돌고 있어야 해요.

Termux에서 한 번만 실행:

```
curl -sL https://raw.githubusercontent.com/damanting0-cyber/tst/main/termux/setup.sh | bash
```

- 이후 Termux를 열 때마다 서버가 꺼져 있으면 자동으로 켜집니다.
- 서버가 꺼져 있으면 Uper는 공유창 → 링크 복사 순으로 대신 동작합니다.
- M4A는 받기 전에 제목·가수를 정할 수 있고, 받은 뒤에도 유리병 → 설정 → 다운로드 기록의 연필 버튼으로 바꿀 수 있습니다 (파일 이름도 '가수 - 제목'으로 바뀜).
- 받는 동안 버튼 위에 진행률 카드가 뜹니다 (MP3 변환·MP4 합치기 단계 포함).
- 기록은 `~/uper-server.log`에 남습니다.

