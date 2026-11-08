// ==UserScript==
// @name         Uper
// @namespace    https://github.com/damanting0-cyber/tst
// @version      1.7.1
// @description  영상을 꾹 누르면 섬네일 위에 팝업(링크 복사/팁)이 뜨고, 담은 영상은 팁 유리통(스와이프 삭제/실행 취소)에 모입니다.
// @author       damanting0-cyber
// @homepageURL  https://github.com/damanting0-cyber/tst
// @supportURL   https://github.com/damanting0-cyber/tst/issues
// @updateURL    https://raw.githubusercontent.com/damanting0-cyber/tst/main/Uper.user.js
// @downloadURL  https://raw.githubusercontent.com/damanting0-cyber/tst/main/Uper.user.js
// @match        https://m.youtube.com/*
// @match        https://www.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const KEY = 'uper_tip_list';
    const HOLD_MS = 500;
    const MOVE_LIMIT = 12;
    const SWIPE_DELETE = 90;
    const SNACK_MS = 4000;
    const FULL_AT = 20;               // 이 개수에서 유리통이 가득 참
    const LINK_SEL = 'a[href*="watch?v="], a[href*="/shorts/"]';
    const CARD_SEL = [
        'ytm-rich-item-renderer', 'ytm-video-with-context-renderer',
        'ytm-compact-video-renderer', 'ytm-compact-autoplay-renderer',
        'ytm-video-renderer', 'ytm-shorts-lockup-view-model',
        'ytm-reel-item-renderer', 'ytd-reel-item-renderer',
        'ytd-rich-item-renderer', 'ytd-video-renderer',
        'ytd-compact-video-renderer', 'yt-lockup-view-model'
    ].join(',');
    // 롱프레스 대상에서 빼는 영역 (댓글, 설명란, 패널)
    const SKIP_SEL = [
        'ytm-comment-thread-renderer', 'ytm-comment-renderer', 'ytm-comments-entry-point-header-renderer',
        'ytd-comment-thread-renderer', 'ytd-comments', 'ytm-engagement-panel', 'ytd-engagement-panel-section-list-renderer',
        'ytm-engagement-panel-section-list-renderer', 'ytm-expandable-video-description-body-renderer',
        'ytd-text-inline-expander', '#player-container-id', 'ytm-player', '#movie_player'
    ].join(',');

    // 플레이어 홀드 배속
    const PLAYER_SEL = ['#player-container-id', '#player-container-outer', 'ytm-player', '#movie_player'];
    const SPEEDS = [1.5, 2, 3];
    const SPEED_START = 1;            // 홀드 시작은 2×
    const SPEED_STEP = 40;            // 손가락을 이만큼(px) 좌우로 옮기면 한 칸 이동
    const SPEED_LOCK_DY = 70;         // 홀드한 채 이만큼(px) 아래로 끌면 배속 고정
    const SPEED_HOLD_MS = 450;

    // Material Icons (Apache 2.0) — 유튜브 앱과 같은 계열의 아이콘
    const ICON = {
        link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
        add: 'M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z',
        trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
        close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
    };
    const JAR_BODY = 'M8 6.5h8v1.2c2.1.8 3.2 2.3 3.2 4.4V18a3 3 0 0 1-3 3H7.8a3 3 0 0 1-3-3v-5.9c0-2.1 1.1-3.6 3.2-4.4z';

    let jar, jarFill, badge, scrim, sheet, sheetCount, listEl, snack, popup, copyBtn, tipBtn;
    let popupOpen = false;
    let sheetOpen = false;
    let anchorEl = null;
    let followId = null;
    let pending = null;
    let holdTimer = null;
    let holdStart = null;
    let holdFired = false;
    let justHeld = false;
    let snackTimer = null;
    let undoState = null;
    let lastCount = -1;

    /* ---------- DOM 헬퍼 (innerHTML 사용 안 함) ---------- */
    function h(tag, props, ...children) {
        const node = document.createElement(tag);
        if (props) {
            for (const k in props) {
                if (k === 'class') node.className = props[k];
                else if (k === 'text') node.textContent = props[k];
                else node.setAttribute(k, props[k]);
            }
        }
        for (const c of children) {
            if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
        return node;
    }

    function svgEl(tag, attrs, ...children) {
        const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        for (const c of children) n.appendChild(c);
        return n;
    }

    function icon(name, size) {
        const s = String(size || 24);
        return svgEl('svg', { viewBox: '0 0 24 24', width: s, height: s, 'aria-hidden': 'true' },
            svgEl('path', { d: ICON[name], fill: 'currentColor' }));
    }

    function showError(msg) {
        const d = h('div', {
            text: msg,
            style: 'position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;' +
                'background:#c00;color:#fff;padding:10px;border-radius:8px;font:14px sans-serif;'
        });
        (document.body || document.documentElement).appendChild(d);
    }

    /* ---------- 저장소 ---------- */
    function loadTips() {
        try { return JSON.parse(GM_getValue(KEY, '[]')) || []; } catch (e) { return []; }
    }
    function saveTips(list) {
        GM_setValue(KEY, JSON.stringify(list));
    }

    /* ---------- 영상 정보 ---------- */
    function idFromHref(href) {
        try {
            const u = new URL(href, location.origin);
            const v = u.searchParams.get('v');
            if (v) return v;
            const m = u.pathname.match(/\/shorts\/([\w-]+)/);
            return m ? m[1] : null;
        } catch (e) { return null; }
    }

    function findCard(link) {
        return link.closest(CARD_SEL) || link;
    }

    // 카드 안에서 가장 큰 이미지(섬네일)를 팝업 기준점으로 사용
    function findThumb(link) {
        const card = findCard(link);
        let best = null;
        let bestW = 0;
        card.querySelectorAll('img').forEach((img) => {
            const w = img.getBoundingClientRect().width;
            if (w > bestW) { bestW = w; best = img; }
        });
        return bestW > 80 ? best : link;
    }

    function isShortsLink(link) {
        return /\/shorts\//.test(link.getAttribute('href') || '');
    }

    function firstText(root, sels) {
        for (const s of sels) {
            const el = root.querySelector(s);
            const t = el && el.textContent.trim();
            if (t) return t;
        }
        return '';
    }

    function getTitle(card, link) {
        const t = firstText(card, [
            'h3', 'h2', '.shortsLockupViewModelHostOutsideMetadataText',
            '.shortsLockupViewModelHostMetadataTitle', '.reel-player-overlay-channel-name',
            '.media-item-headline', '.compact-media-item-headline', '#video-title',
            '.yt-lockup-metadata-view-model__title', '[role="heading"]'
        ]);
        if (t) return t;
        const img = card.querySelector('img[alt]');
        if (img && img.alt) return img.alt.trim();
        return link.getAttribute('aria-label') || link.getAttribute('title') || '제목 없음';
    }

    function getChannel(card) {
        const links = card.querySelectorAll('a[href^="/@"], a[href*="/channel/"], a[href*="/user/"]');
        for (const a of links) {
            const t = a.textContent.trim();
            if (t) return t;
        }
        const byText = firstText(card, [
            'ytm-channel-name', '#channel-name', 'ytd-channel-name',
            '.shortsLockupViewModelHostOutsideMetadataSubhead',
            '.media-item-byline', '.compact-media-item-byline',
            '.yt-content-metadata-view-model__metadata-text'
        ]);
        if (byText) return byText.split('•')[0].trim();
        return '알 수 없음';
    }

    function getInfo(link) {
        const videoId = idFromHref(link.href);
        if (!videoId) return null;
        const card = findCard(link);
        return {
            videoId,
            url: 'https://www.youtube.com/watch?v=' + videoId,
            title: getTitle(card, link),
            channel: getChannel(card),
            thumb: 'https://i.ytimg.com/vi/' + videoId + (isShortsLink(link) ? '/hqdefault.jpg' : '/mqdefault.jpg')
        };
    }

    /* ---------- 스타일 (유튜브 다크/라이트 토큰 + 유튜브식 모션) ---------- */
    function injectStyle() {
        const css = `
        :root {
            --uper-ease: cubic-bezier(.05, .7, .1, 1);      /* 들어올 때: 빠르게 시작, 부드럽게 멈춤 */
            --uper-ease-out: cubic-bezier(.3, 0, .8, .15);  /* 나갈 때 */
            --uper-font: "YouTube Sans", Roboto, "Noto Sans KR", Arial, sans-serif;
            --uper-red: #ff0033;
            --uper-sheet: #212121;
            --uper-surface: #272727;
            --uper-text: #f1f1f1;
            --uper-text2: #aaaaaa;
            --uper-divider: rgba(255,255,255,.1);
            --uper-press: rgba(255,255,255,.1);
            --uper-handle: rgba(255,255,255,.3);
            --uper-snack-bg: #f1f1f1;
            --uper-snack-text: #0f0f0f;
            --uper-snack-action: #065fd4;
            --uper-shadow: 0 4px 32px rgba(0,0,0,.4);
        }
        html.uper-light {
            --uper-sheet: #ffffff;
            --uper-surface: #ffffff;
            --uper-text: #0f0f0f;
            --uper-text2: #606060;
            --uper-divider: rgba(0,0,0,.1);
            --uper-press: rgba(0,0,0,.05);
            --uper-handle: rgba(0,0,0,.2);
            --uper-snack-bg: #0f0f0f;
            --uper-snack-text: #f1f1f1;
            --uper-snack-action: #3ea6ff;
            --uper-shadow: 0 4px 24px rgba(0,0,0,.16);
        }

        .uper-btn-reset {
            border: none; background: none; padding: 0; margin: 0; color: inherit;
            font: inherit; -webkit-tap-highlight-color: transparent; cursor: pointer;
        }

        /* ---- 롱프레스 팝업 ---- */
        #uper-popup {
            position: fixed; z-index: 2147483640; display: flex; gap: 2px; padding: 4px;
            background: var(--uper-sheet); color: var(--uper-text);
            border-radius: 999px; box-shadow: var(--uper-shadow);
            font-family: var(--uper-font);
            transform-origin: left bottom;
            opacity: 0; transform: scale(.88) translateY(6px);
            visibility: hidden; pointer-events: none;
            transition: opacity .12s var(--uper-ease-out), transform .12s var(--uper-ease-out), visibility 0s .12s;
        }
        #uper-popup.open {
            opacity: 1; transform: none; visibility: visible; pointer-events: auto;
            transition: opacity .2s var(--uper-ease), transform .25s var(--uper-ease), visibility 0s;
        }
        #uper-popup button {
            display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px 0 10px;
            border-radius: 999px; font-size: 14px; font-weight: 500;
            transition: background-color .15s, transform .15s var(--uper-ease);
        }
        #uper-popup button svg { flex-shrink: 0; }
        #uper-popup button:active { background: var(--uper-press); transform: scale(.95); }
        #uper-popup .tip-btn { background: var(--uper-text); color: var(--uper-sheet); }
        #uper-popup .tip-btn:active { background: var(--uper-text); opacity: .85; }

        /* ---- 유리통 버튼 ---- */
        #uper-jar {
            position: fixed; right: 16px; bottom: 16px; z-index: 2147483620;
            width: 48px; height: 48px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: var(--uper-surface); color: var(--uper-text);
            box-shadow: 0 2px 8px rgba(0,0,0,.3);
            transition: bottom .3s var(--uper-ease), transform .2s var(--uper-ease), opacity .2s;
        }
        #uper-jar:active { transform: scale(.9); }
        #uper-jar.pop { animation: uper-pop .45s var(--uper-ease); }
        #uper-jar .fill {
            transform-box: fill-box; transform-origin: center bottom;
            transition: transform .5s var(--uper-ease);
        }
        #uper-jar .count {
            position: absolute; top: -4px; right: -4px; min-width: 12px; height: 16px;
            padding: 0 2px; box-sizing: content-box; border-radius: 10px;
            background: var(--uper-red); color: #fff; text-align: center;
            font: 500 11px/16px var(--uper-font);
            border: 2px solid var(--uper-surface);
            transform: scale(0); transition: transform .25s var(--uper-ease);
        }
        #uper-jar .count.on { transform: scale(1); }
        @keyframes uper-pop {
            0% { transform: scale(1); }
            35% { transform: scale(1.14); }
            100% { transform: scale(1); }
        }

        /* ---- 바텀시트 (유튜브 시트 스타일) ---- */
        #uper-scrim {
            position: fixed; inset: 0; z-index: 2147483630;
            background: rgba(0,0,0,.6); opacity: 0; visibility: hidden;
            transition: opacity .2s linear, visibility 0s .2s;
            -webkit-tap-highlight-color: transparent;
        }
        #uper-scrim.open { opacity: 1; visibility: visible; transition: opacity .25s linear, visibility 0s; }

        #uper-sheet {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483635;
            max-width: 640px; margin: 0 auto; max-height: 75vh;
            display: flex; flex-direction: column;
            background: var(--uper-sheet); color: var(--uper-text);
            border-radius: 12px 12px 0 0; box-shadow: var(--uper-shadow);
            font-family: var(--uper-font);
            padding-bottom: env(safe-area-inset-bottom);
            transform: translateY(100%); visibility: hidden;
            transition: transform .2s var(--uper-ease-out), visibility 0s .2s;
        }
        #uper-sheet.open {
            transform: translateY(0); visibility: visible;
            transition: transform .35s var(--uper-ease), visibility 0s;
        }
        #uper-sheet.dragging { transition: none; }
        #uper-sheet .grab { padding: 8px 0 0; flex-shrink: 0; touch-action: none; }
        #uper-sheet .handle {
            width: 40px; height: 4px; border-radius: 2px; margin: 0 auto;
            background: var(--uper-handle);
        }
        #uper-sheet .head {
            display: flex; align-items: center; padding: 8px 8px 8px 16px;
            border-bottom: 1px solid var(--uper-divider);
        }
        #uper-sheet .head h2 {
            margin: 0; font-size: 16px; font-weight: 600; line-height: 22px; flex: 1;
        }
        #uper-sheet .head .num { margin-left: 6px; color: var(--uper-text2); font-weight: 400; }
        #uper-sheet .close {
            width: 40px; height: 40px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            transition: background-color .15s;
        }
        #uper-sheet .close:active { background: var(--uper-press); }
        #uper-sheet .list {
            overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain;
            padding: 4px 0 12px;
        }
        #uper-sheet .empty {
            display: flex; flex-direction: column; align-items: center; gap: 8px;
            padding: 40px 24px 48px; color: var(--uper-text2); font-size: 14px; text-align: center;
        }
        #uper-sheet .empty svg { opacity: .6; }

        .uper-row { position: relative; overflow: hidden; }
        .uper-row .uper-hint {
            position: absolute; inset: 0; display: flex; align-items: center; justify-content: flex-end;
            gap: 6px; padding-right: 20px; background: #cc0000; color: #fff;
            font-size: 14px; font-weight: 500; opacity: 0;
        }
        .uper-item {
            display: flex; gap: 12px; padding: 8px 16px; position: relative;
            background: var(--uper-sheet);
            transition: transform .3s var(--uper-ease), opacity .2s, background-color .15s;
            touch-action: pan-y; -webkit-tap-highlight-color: transparent;
        }
        .uper-item:active { background: var(--uper-press); }
        .uper-sheet-in .uper-row { animation: uper-row-in .35s var(--uper-ease) both; }
        @keyframes uper-row-in {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: none; }
        }
        .uper-item img {
            width: 128px; aspect-ratio: 16 / 9; height: auto; object-fit: cover; border-radius: 8px;
            flex-shrink: 0; background: var(--uper-press);
        }
        .uper-item .info { display: flex; flex-direction: column; min-width: 0; flex: 1; padding-top: 2px; }
        .uper-item .title {
            font-size: 14px; font-weight: 500; line-height: 20px; display: -webkit-box;
            -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .uper-item .channel {
            margin-top: 4px; font-size: 12px; line-height: 18px; color: var(--uper-text2);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ---- 스낵바 (유튜브 알림 + 실행 취소) ---- */
        /* ---- 홀드 배속: 영상만 깔끔하게 남기기 ---- */
        html.uper-speed .uper-speed-root :not(.uper-keep, #uper-speed, #uper-speed *) {
            opacity: 0 !important; visibility: hidden !important; transition: none !important;
        }
        html.uper-speed .uper-keep::before, html.uper-speed .uper-keep::after { opacity: 0 !important; }

        /* ---- 홀드 배속 플로팅 (영상 위쪽 가운데, 가로 3칸 ↔ 고정 시 좌상단에 현재 배속 1칸) ---- */
        #uper-speed {
            position: fixed; z-index: 2147483645; left: 0; top: 0;
            box-sizing: border-box; width: 130px; height: 28px; padding: 2px;
            border-radius: 14px; overflow: hidden;
            background: rgba(0,0,0,.55);
            -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
            font: 500 12px/1 var(--uper-font); color: #fff;
            pointer-events: none; user-select: none; -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            transform-origin: top center;
            opacity: 0; visibility: hidden; transform: scale(.85);
            transition: opacity .15s linear, transform .25s var(--uper-ease-out),
                width .4s var(--uper-ease), visibility 0s .25s;
        }
        #uper-speed.open {
            opacity: 1; visibility: visible; transform: scale(1);
            transition: opacity .2s linear, transform .35s var(--uper-ease),
                width .4s var(--uper-ease), left .45s var(--uper-ease), top .45s var(--uper-ease), visibility 0s;
        }
        #uper-speed.compact { width: 46px; pointer-events: auto; transform-origin: top left; }
        #uper-speed.open.compact { transform: scale(.9); opacity: .6; }
        /* 아래로 끌 때 고정까지 남은 정도를 선택된 칸의 빨간 테두리로 표시 */
        #uper-speed .ring {
            position: absolute; left: 0; top: 0; width: 42px; height: 24px;
            pointer-events: none; overflow: visible;
        }
        #uper-speed .ring rect {
            fill: none; stroke: var(--uper-red); stroke-width: 2; stroke-linecap: round;
            stroke-dasharray: 100 100; stroke-dashoffset: 100;
            transition: stroke-dashoffset .08s linear, opacity .2s;
        }
        #uper-speed.compact .ring { opacity: 0; transition: opacity .45s var(--uper-ease); }

        /* 고정되며 접힐 때: 빨간 칸이 접히는 움직임과 같은 속도로 서서히 투명해짐 */
        #uper-speed.open.compact {
            transition: opacity .45s var(--uper-ease), transform .45s var(--uper-ease),
                width .45s var(--uper-ease), left .45s var(--uper-ease), top .45s var(--uper-ease), visibility 0s;
        }
        #uper-speed.compact .track { transition: transform .45s var(--uper-ease); }
        #uper-speed.compact .hl {
            transition: transform .45s var(--uper-ease), background-color .45s var(--uper-ease);
        }
        #uper-speed.compact .seg { transition: color .45s var(--uper-ease), opacity .45s; }
        #uper-speed .track { position: relative; display: flex; transition: transform .4s var(--uper-ease); }
        #uper-speed .hl {
            position: absolute; top: 0; left: 0; width: 42px; height: 24px;
            border-radius: 999px; background: #fff;
            transition: transform .32s cubic-bezier(.2, .9, .3, 1.15), background-color .25s;
        }
        #uper-speed .seg {
            position: relative; flex-shrink: 0; width: 42px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            transition: color .25s, opacity .25s;
        }
        #uper-speed .seg.on { color: #0f0f0f; }
        #uper-speed.lock .hl { background: var(--uper-red); }
        #uper-speed.lock .seg.on { color: #fff; }
        #uper-speed.compact .hl { background: rgba(255,255,255,0); }
        #uper-speed.compact .seg.on { color: #fff; }

        #uper-snack {
            position: fixed; left: 12px; right: 12px; bottom: 16px; z-index: 2147483647;
            max-width: 480px; margin: 0 auto; box-sizing: border-box;
            display: flex; align-items: center; gap: 8px; min-height: 48px;
            padding: 6px 8px 6px 16px; border-radius: 8px;
            background: var(--uper-snack-bg); color: var(--uper-snack-text);
            font: 14px/20px var(--uper-font); box-shadow: 0 4px 12px rgba(0,0,0,.3);
            opacity: 0; transform: translateY(16px); visibility: hidden; pointer-events: none;
            transition: opacity .15s linear, transform .2s var(--uper-ease-out), visibility 0s .2s, bottom .3s var(--uper-ease);
        }
        #uper-snack.open {
            opacity: 1; transform: none; visibility: visible; pointer-events: auto;
            transition: opacity .2s linear, transform .3s var(--uper-ease), visibility 0s, bottom .3s var(--uper-ease);
        }
        #uper-snack .msg { flex: 1; min-width: 0; padding: 6px 0; }
        #uper-snack .action {
            color: var(--uper-snack-action); font-weight: 500; padding: 0 12px; height: 36px;
            border-radius: 18px; flex-shrink: 0;
        }
        #uper-snack .action:active { background: rgba(62,166,255,.15); }

        @media (prefers-reduced-motion: reduce) {
            #uper-popup, #uper-sheet, #uper-scrim, #uper-snack, #uper-jar, .uper-item, #uper-jar .fill {
                transition-duration: .01s !important; animation: none !important;
            }
            .uper-sheet-in .uper-row { animation: none !important; }
        }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- 유튜브 테마(다크/라이트) 따라가기 ---------- */
    function syncTheme() {
        const root = document.documentElement;
        let light;
        if (root.hasAttribute('dark') || root.hasAttribute('darker-dark-theme')) {
            light = false;
        } else {
            const els = [document.querySelector('ytm-app, ytd-app'), document.body, root];
            let rgb = null;
            for (const el of els) {
                if (!el) continue;
                const m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
                if (m && (m.length < 4 || +m[3] > 0)) { rgb = m.map(Number); break; }
            }
            light = rgb ? (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 140 : false;
        }
        root.classList.toggle('uper-light', light);
    }

    /* ---------- 유리통 아이콘 (담긴 개수만큼 빨간색이 차오름) ---------- */
    function buildJarIcon() {
        const clipId = 'uper-jar-clip';
        jarFill = svgEl('rect', { class: 'fill', x: '4', y: '7', width: '16', height: '14', fill: 'var(--uper-red)' });
        jarFill.style.transform = 'scaleY(0)';
        return svgEl('svg', { viewBox: '0 0 24 24', width: '26', height: '26', 'aria-hidden': 'true' },
            svgEl('defs', {}, svgEl('clipPath', { id: clipId }, svgEl('path', { d: JAR_BODY }))),
            svgEl('g', { 'clip-path': `url(#${clipId})` }, jarFill),
            svgEl('path', { d: JAR_BODY, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linejoin': 'round' }),
            svgEl('rect', { x: '7', y: '3', width: '10', height: '3.2', rx: '1.2', fill: 'currentColor' })
        );
    }

    function refreshJar(count) {
        const frac = count === 0 ? 0 : Math.max(0.15, Math.min(1, count / FULL_AT));
        jarFill.style.transform = `scaleY(${frac})`;
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.classList.toggle('on', count > 0);
        jar.setAttribute('aria-label', `팁 유리통, ${count}개`);
        if (lastCount >= 0 && count > lastCount) {
            jar.classList.remove('pop');
            void jar.offsetWidth;
            jar.classList.add('pop');
        }
        lastCount = count;
    }

    /* ---------- 하단 메뉴 높이에 맞춘 위치 ---------- */
    function navHeight() {
        const nav = document.querySelector('ytm-pivot-bar-renderer, ytm-pivot-bar');
        if (!nav) return 0;
        const r = nav.getBoundingClientRect();
        return (r.height > 0 && r.bottom >= innerHeight - 4) ? r.height : 0;
    }

    let lastBottom = '';
    function updateLayout() {
        const b = navHeight() + 16;
        const bottom = b + 'px';
        if (bottom !== lastBottom) {
            lastBottom = bottom;
            jar.style.bottom = bottom;
        }
        snack.style.bottom = (sheetOpen ? 16 : b + 60) + 'px';
    }

    /* ---------- UI 생성 ---------- */
    function buildUI() {
        copyBtn = h('button', { class: 'uper-btn-reset copy-btn', type: 'button' }, icon('link', 20), '링크 복사');
        tipBtn = h('button', { class: 'uper-btn-reset tip-btn', type: 'button' }, icon('add', 20), '팁');
        popup = h('div', { id: 'uper-popup', role: 'menu' }, copyBtn, tipBtn);

        badge = h('span', { class: 'count' });
        jar = h('button', { id: 'uper-jar', class: 'uper-btn-reset', type: 'button', 'aria-label': '팁 유리통' },
            buildJarIcon(), badge);

        scrim = h('div', { id: 'uper-scrim' });
        sheetCount = h('span', { class: 'num' });
        const closeBtn = h('button', { class: 'uper-btn-reset close', type: 'button', 'aria-label': '닫기' }, icon('close', 24));
        closeBtn.addEventListener('click', closeSheet);
        listEl = h('div', { class: 'list' });
        sheet = h('div', { id: 'uper-sheet', role: 'dialog', 'aria-label': '팁 유리통' },
            h('div', { class: 'grab' }, h('div', { class: 'handle' })),
            h('div', { class: 'head' }, h('h2', {}, '팁 유리통', sheetCount), closeBtn),
            listEl
        );

        snack = h('div', { id: 'uper-snack', role: 'status' });

        [popup, jar, scrim, sheet, snack].forEach((el) => document.body.appendChild(el));
        scrim.addEventListener('click', closeSheet);
        bindSheetDrag();
    }

    /* ---------- 스낵바 ---------- */
    function hideSnack() {
        snack.classList.remove('open');
        undoState = null;
        clearTimeout(snackTimer);
    }

    function showSnack(msg, actionText, onAction) {
        snack.textContent = '';
        snack.appendChild(h('span', { class: 'msg', text: msg }));
        if (actionText) {
            const btn = h('button', { class: 'uper-btn-reset action', type: 'button', text: actionText });
            bindTap(btn, onAction);
            snack.appendChild(btn);
        } else {
            undoState = null;
        }
        updateLayout();
        snack.classList.remove('open');
        void snack.offsetWidth;
        snack.classList.add('open');
        clearTimeout(snackTimer);
        snackTimer = setTimeout(hideSnack, actionText ? SNACK_MS : 2000);
    }

    /* ---------- 버튼 탭 (touchend + click 중복 방지) ---------- */
    function bindTap(btn, fn) {
        let last = 0;
        const run = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (now - last < 400) return;
            last = now;
            fn();
        };
        btn.addEventListener('touchend', run, { passive: false });
        btn.addEventListener('click', run);
    }

    /* ---------- 팝업: 섬네일 좌하단에 붙어서 따라감 ---------- */
    function positionPopup() {
        if (!anchorEl || !anchorEl.isConnected) { hidePopup(); return; }
        const r = anchorEl.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) { hidePopup(); return; }

        const pw = popup.offsetWidth;
        const ph = popup.offsetHeight;
        const left = Math.min(Math.max(r.left + 8, 8), innerWidth - pw - 8);
        let top = r.bottom - ph - 8;
        top = Math.min(Math.max(top, 8), innerHeight - ph - 8);

        popup.style.left = left + 'px';
        popup.style.top = top + 'px';
    }

    function followLoop() {
        if (!popupOpen) { followId = null; return; }
        positionPopup();
        followId = requestAnimationFrame(followLoop);
    }

    function startFollow() {
        if (followId) cancelAnimationFrame(followId);
        followId = requestAnimationFrame(followLoop);
    }

    function stopFollow() {
        if (followId) cancelAnimationFrame(followId);
        followId = null;
    }

    function showPopup(anchor, info) {
        pending = info;
        anchorEl = anchor;
        popupOpen = true;
        positionPopup();
        popup.classList.add('open');
        startFollow();
    }

    function hidePopup() {
        if (!popupOpen) return;
        popupOpen = false;
        stopFollow();
        pending = null;
        anchorEl = null;
        popup.classList.remove('open');
    }

    /* ---------- 롱프레스 (터치) ---------- */
    function isOurs(t) {
        return popup.contains(t) || jar.contains(t) || sheet.contains(t) || scrim.contains(t) || snack.contains(t);
    }

    // 댓글·설명·패널 안의 링크(타임스탬프 등)는 건드리지 않고, 섬네일 있는 영상 카드만 대상으로 함
    function videoLink(t) {
        const link = t && t.closest ? t.closest(LINK_SEL) : null;
        if (!link || link.closest(SKIP_SEL)) return null;
        if (findCard(link) === link && !link.querySelector('img')) return null;
        return link;
    }

    function bindHold() {
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const t = e.target;
            if (isOurs(t)) return;

            const link = videoLink(t);
            if (!link) return;
            const info = getInfo(link);
            if (!info) return;

            holdFired = false;
            holdStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };

            clearTimeout(holdTimer);
            holdTimer = setTimeout(() => {
                holdTimer = null;
                holdFired = true;
                justHeld = true;
                setTimeout(() => { justHeld = false; }, 700);
                if (navigator.vibrate) navigator.vibrate(15);
                showPopup(findThumb(link), info);
            }, HOLD_MS);
        }, { capture: true, passive: true });   // 막는 일이 없으므로 passive: 스크롤·터치 반응 지연 없음

        document.addEventListener('touchmove', (e) => {
            if (!holdTimer || !holdStart) return;
            const p = e.touches[0];
            if (Math.hypot(p.clientX - holdStart.x, p.clientY - holdStart.y) > MOVE_LIMIT) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
        }, { capture: true, passive: true });

        ['touchend', 'touchcancel'].forEach((type) => {
            document.addEventListener(type, (e) => {
                clearTimeout(holdTimer);
                holdTimer = null;
                if (holdFired) {
                    if (e.cancelable) e.preventDefault();
                    holdFired = false;
                }
            }, { capture: true, passive: false });
        });

        document.addEventListener('click', (e) => {
            if (justHeld && videoLink(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                justHeld = false;
                return;
            }
            if (!popupOpen || popup.contains(e.target)) return;
            hidePopup();
            // 팝업 닫으려고 다른 영상을 탭한 경우에만 이동을 막음.
            // 버튼(답글 더보기, 댓글 열기 등)은 그대로 동작하게 둠
            if (videoLink(e.target)) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, true);

        document.addEventListener('contextmenu', (e) => {
            if (videoLink(e.target)) e.preventDefault();
        }, true);
    }

    /* ---------- 복사 / 팁 ---------- */
    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            GM_setClipboard(text, 'text');
        }
    }

    function addTip(info) {
        const list = loadTips();
        if (list.some(t => t.videoId === info.videoId)) {
            showSnack('이미 유리통에 있는 영상이에요');
            return;
        }
        list.unshift(info);
        saveTips(list);
        renderList();
        showSnack('유리통에 담았어요', '보기', () => { hideSnack(); openSheet(); });
    }

    function bindPopup() {
        bindTap(copyBtn, async () => {
            if (!pending) return;
            const url = pending.url;
            hidePopup();
            await copyText(url);
            showSnack('링크를 복사했어요');
        });
        bindTap(tipBtn, () => {
            if (!pending) return;
            const info = pending;
            hidePopup();
            addTip(info);
        });
    }

    /* ---------- 삭제 / 실행 취소 ---------- */
    function deleteTipWithUndo(videoId) {
        const list = loadTips();
        const index = list.findIndex(t => t.videoId === videoId);
        if (index < 0) return;
        const item = list[index];
        list.splice(index, 1);
        saveTips(list);
        renderList();

        const state = { item, index };
        showSnack('유리통에서 삭제했어요', '실행 취소', () => {
            if (undoState !== state) return;
            const cur = loadTips();
            if (!cur.some(t => t.videoId === state.item.videoId)) {
                cur.splice(Math.min(state.index, cur.length), 0, state.item);
                saveTips(cur);
            }
            hideSnack();
            renderList();
        });
        undoState = state;
    }

    /* ---------- 바텀시트 ---------- */
    function openSheet() {
        if (sheetOpen) return;
        hidePopup();
        sheetOpen = true;
        renderList(true);
        sheet.style.transform = '';
        scrim.classList.add('open');
        sheet.classList.add('open');
        updateLayout();
    }

    function closeSheet() {
        if (!sheetOpen) return;
        sheetOpen = false;
        sheet.style.transform = '';
        scrim.classList.remove('open');
        sheet.classList.remove('open');
        updateLayout();
        // 닫히는 애니메이션이 끝나면 목록과 섬네일을 비움
        setTimeout(() => { if (!sheetOpen) listEl.textContent = ''; }, 300);
    }

    // 손잡이/제목줄을 아래로 끌어내리면 닫힘
    function bindSheetDrag() {
        let startY = 0;
        let dy = 0;
        let dragging = false;
        const zone = (t) => t.closest && (t.closest('#uper-sheet .grab') || t.closest('#uper-sheet .head'));

        sheet.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || !zone(e.target)) return;
            dragging = true;
            startY = e.touches[0].clientY;
            dy = 0;
            sheet.classList.add('dragging');
        }, { passive: true });

        sheet.addEventListener('touchmove', (e) => {
            if (!dragging) return;
            dy = Math.max(0, e.touches[0].clientY - startY);
            sheet.style.transform = `translateY(${dy}px)`;
        }, { passive: true });

        const end = () => {
            if (!dragging) return;
            dragging = false;
            sheet.classList.remove('dragging');
            if (dy > 80) closeSheet();
            else sheet.style.transform = '';
        };
        sheet.addEventListener('touchend', end);
        sheet.addEventListener('touchcancel', end);
    }

    function bindSwipe(row, item) {
        const itemEl = row.querySelector('.uper-item');
        const hint = row.querySelector('.uper-hint');
        let startX = 0;
        let startY = 0;
        let dx = 0;
        let tracking = false;
        let moved = false;

        row.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            dx = 0;
            tracking = true;
            moved = false;
            itemEl.style.transition = 'none';
        }, { passive: true });

        row.addEventListener('touchmove', (e) => {
            if (!tracking) return;
            const p = e.touches[0];
            const ddx = p.clientX - startX;
            const ddy = p.clientY - startY;
            if (!moved && Math.abs(ddy) > Math.abs(ddx)) { tracking = false; itemEl.style.transition = ''; return; }
            if (Math.abs(ddx) > 6) moved = true;
            dx = Math.min(0, ddx);
            itemEl.style.transform = `translateX(${dx}px)`;
            hint.style.opacity = String(Math.min(1, Math.abs(dx) / SWIPE_DELETE));
        }, { passive: true });

        const end = () => {
            if (!tracking) return;
            tracking = false;
            itemEl.style.transition = '';
            if (dx <= -SWIPE_DELETE) {
                itemEl.style.transform = 'translateX(-100%)';
                row.style.transition = 'height .2s var(--uper-ease) .15s';
                row.style.height = row.offsetHeight + 'px';
                void row.offsetHeight;
                row.style.height = '0px';
                setTimeout(() => deleteTipWithUndo(item.videoId), 350);
            } else {
                itemEl.style.transform = 'translateX(0)';
                hint.style.opacity = '0';
            }
            if (moved) row.dataset.swiped = '1';
        };
        row.addEventListener('touchend', end);
        row.addEventListener('touchcancel', end);
    }

    function renderList(animate) {
        const list = loadTips();
        refreshJar(list.length);
        sheetCount.textContent = list.length ? String(list.length) : '';
        // 시트가 닫혀 있으면 섬네일을 불러오지 않음 (트래픽 절약)
        if (!sheetOpen) return;

        listEl.textContent = '';
        listEl.classList.toggle('uper-sheet-in', !!animate);
        if (!list.length) {
            const empty = h('div', { class: 'empty' }, icon('add', 40),
                h('div', { text: '아직 담긴 영상이 없어요' }),
                h('div', { text: '영상을 길게 눌러 팁으로 담아 보세요' }));
            listEl.appendChild(empty);
            return;
        }

        list.forEach((t, i) => {
            const img = h('img', { alt: '', loading: 'lazy' });
            img.src = t.thumb;

            const item = h('div', { class: 'uper-item' },
                img,
                h('div', { class: 'info' },
                    h('div', { class: 'title', text: t.title }),
                    h('div', { class: 'channel', text: t.channel })
                )
            );
            const hint = h('div', { class: 'uper-hint' }, icon('trash', 20), '삭제');
            const row = h('div', { class: 'uper-row' }, hint, item);
            if (animate) row.style.animationDelay = Math.min(i, 8) * 30 + 'ms';

            bindSwipe(row, t);

            row.addEventListener('click', () => {
                if (row.dataset.swiped) { delete row.dataset.swiped; return; }
                location.href = t.url;
            });
            listEl.appendChild(row);
        });
    }

    function bindJar() {
        jar.addEventListener('click', (e) => {
            e.stopPropagation();
            hidePopup();
            if (sheetOpen) closeSheet();
            else openSheet();
        });
    }

    /* ---------- 플레이어 홀드 배속 (2× / 3× / 4×, 좌우로 밀어 선택) ---------- */
    function playerRoot(t) {
        if (!t || !t.closest) return null;
        for (const s of PLAYER_SEL) {
            const el = t.closest(s);
            if (el) return el;
        }
        return null;
    }

    function bindSpeedHold() {
        const COL = 42;
        const N = SPEEDS.length;                    // 왼쪽부터 1.5×, 2×, 3×

        const box = h('div', { id: 'uper-speed', 'aria-hidden': 'true' });
        const track = h('div', { class: 'track' });
        const hl = h('div', { class: 'hl' });
        track.appendChild(hl);
        const segs = [];
        for (let i = 0; i < N; i++) {
            const seg = h('div', { class: 'seg', text: SPEEDS[i] + '×' });
            segs[i] = seg;
            track.appendChild(seg);
        }
        box.appendChild(track);
        const ringRect = svgEl('rect', { x: '1', y: '1', width: '40', height: '22', rx: '11', pathLength: '100' });
        hl.appendChild(svgEl('svg', { class: 'ring', viewBox: '0 0 42 24', 'aria-hidden': 'true' }, ringRect));
        document.body.appendChild(box);

        // 전체화면에서는 전체화면 요소 안에 있어야 보이므로 그쪽으로 옮김
        function mountBox() {
            const fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            const host = fs && fs.tagName !== 'VIDEO' ? fs : document.body;
            if (box.parentNode !== host) host.appendChild(box);
        }
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach((type) => {
            document.addEventListener(type, () => {
                mountBox();
                if (locked && !active) setTimeout(placeCompact, 300);   // 화면 회전·크기 변화가 끝난 뒤 위치 다시 계산
            });
        });
        window.addEventListener('resize', () => { if (locked && !active) placeCompact(); });

        // 0~1: 테두리가 박스를 감싸는 정도
        function setRing(f) {
            ringRect.style.strokeDashoffset = String(100 - Math.max(0, Math.min(1, f)) * 100);
        }

        let timer = null;
        let start = null;      // 터치 시작 지점
        let lastX = 0;         // 마지막 손가락 x
        let baseX = 0;         // 배속이 켜진 순간의 손가락 x
        let startIdx = SPEED_START;
        let root = null;
        let video = null;
        let origRate = 1;
        let idx = 0;
        let active = false;
        let armed = false;     // 아래로 끌어서 고정 준비됨
        let kept = [];

        let locked = false;    // 배속 고정 상태
        let lockIdx = SPEED_START;
        let lockVideo = null;
        let baseRate = 1;      // 고정 전 원래 배속

        const want = () => (active ? SPEEDS[idx] : locked ? SPEEDS[lockIdx] : null);
        const guard = (e) => {
            const r = want();
            const v = e && e.target;
            if (r != null && v && v.playbackRate !== r) v.playbackRate = r;
        };
        const blockMove = (e) => { if (active && e.cancelable) e.preventDefault(); };
        const blockMenu = (e) => { if (active) e.preventDefault(); };

        // 유튜브가 홀드를 끝내며 배속을 되돌리는 것보다 나중에 한 번 더 맞춤
        function settle(v, rate) {
            v.playbackRate = rate;
            [60, 300].forEach((ms) => setTimeout(() => {
                if (!active && v.playbackRate !== rate) v.playbackRate = rate;
            }, ms));
        }

        function paint(i, snap) {
            if (snap) { hl.style.transition = 'none'; track.style.transition = 'none'; }
            hl.style.transform = `translateX(${i * COL}px)`;
            segs.forEach((s, k) => s.classList.toggle('on', k === i));
            track.style.transform = box.classList.contains('compact') ? `translateX(${-i * COL}px)` : '';
            if (snap) { void box.offsetWidth; hl.style.transition = ''; track.style.transition = ''; }
        }

        function select(i) {
            if (i === idx) return;
            idx = i;
            paint(i);
            if (video) video.playbackRate = SPEEDS[i];
            if (navigator.vibrate) navigator.vibrate(8);
        }

        // 홀드가 켜진 지점 기준 좌우 이동: 오른쪽으로 빠르게, 왼쪽으로 느리게
        function indexAt(x) {
            const i = startIdx + Math.round((x - baseX) / SPEED_STEP);
            return Math.max(0, Math.min(N - 1, i));
        }

        function setArmed(on) {
            if (on === armed) return;
            armed = on;
            box.classList.toggle('lock', on);
            if (navigator.vibrate) navigator.vibrate(on ? 20 : 8);
        }

        function markKeep() {
            kept = [];
            let n = video;
            while (n && n !== root) { n.classList.add('uper-keep'); kept.push(n); n = n.parentElement; }
            root.classList.add('uper-speed-root');
        }

        // 플로팅은 항상 영상 좌상단
        // 펼쳐진 플로팅은 영상 위쪽 가운데, 고정된 작은 플로팅은 영상 좌상단
        const FULL_W = 130;
        let morphUntil = 0;    // 이 시각까지는 위치 이동을 애니메이션으로
        function place(v, compact, animate) {
            const r = v.getBoundingClientRect();
            const left = compact ? Math.max(r.left, 0) + 8 : r.left + r.width / 2 - FULL_W / 2;
            const top = Math.max(r.top, 0) + 8;
            if (!animate) box.style.transition = 'none';
            box.style.left = left + 'px';
            box.style.top = top + 'px';
            if (!animate) { void box.offsetWidth; box.style.transition = ''; }
            return r;
        }

        // 고정 중: 화면에 영상이 보일 때만 작은 플로팅 표시
        function placeCompact() {
            if (!locked || active) return;
            const v = lockVideo && lockVideo.isConnected ? lockVideo : null;
            if (!v) { box.classList.remove('open'); return; }
            mountBox();
            const r = place(v, true, Date.now() < morphUntil);
            box.classList.toggle('open', r.bottom > 44 && r.height > 40);
        }

        function unlock() {
            if (!locked) return;
            locked = false;
            const v = lockVideo;
            lockVideo = null;
            if (v) { v.removeEventListener('ratechange', guard); settle(v, baseRate); }
            box.classList.remove('open');
            setTimeout(() => { if (!active && !locked) box.classList.remove('compact'); }, 250);
            if (navigator.vibrate) navigator.vibrate(15);
        }

        bindTap(box, () => { if (locked && !active) unlock(); });
        window.addEventListener('scroll', placeCompact, { passive: true });
        setInterval(() => {
            if (!locked || active) return;
            // 같은 페이지에서 영상 요소가 바뀌어도 고정 배속 유지
            const v = document.querySelector(PLAYER_SEL.map((s) => s + ' video').join(','));
            if (v && v !== lockVideo) {
                if (lockVideo) lockVideo.removeEventListener('ratechange', guard);
                lockVideo = v;
                v.addEventListener('ratechange', guard);
            }
            if (lockVideo && lockVideo.playbackRate !== SPEEDS[lockIdx]) lockVideo.playbackRate = SPEEDS[lockIdx];
            placeCompact();
        }, 500);

        function begin() {
            timer = null;
            if (!root || !root.isConnected || !video) return;
            const wasLocked = locked;

            active = true;
            armed = false;
            box.classList.remove('lock');
            markKeep();
            document.documentElement.classList.add('uper-speed');
            video.addEventListener('ratechange', guard);
            document.addEventListener('touchmove', blockMove, { capture: true, passive: false });

            mountBox();
            const fromCompact = wasLocked && box.classList.contains('open');
            morphUntil = Date.now() + 500;
            place(video, false, fromCompact);   // 작은 플로팅이었다면 가운데로 미끄러지며 펼쳐짐
            setRing(0);
            baseX = lastX;
            startIdx = wasLocked ? lockIdx : SPEED_START;
            idx = startIdx;
            video.playbackRate = SPEEDS[idx];

            if (fromCompact) {
                // 고정된 작은 플로팅이 그대로 펼쳐짐
                box.classList.remove('compact');
                paint(idx);
            } else {
                box.classList.remove('compact');
                paint(idx, true);
                box.classList.add('open');
            }
            if (navigator.vibrate) navigator.vibrate(15);
        }

        function finish() {
            clearTimeout(timer);
            timer = null;
            if (!active) return;
            active = false;
            const v = video;
            v.removeEventListener('ratechange', guard);
            document.removeEventListener('touchmove', blockMove, { capture: true });
            document.documentElement.classList.remove('uper-speed');
            kept.forEach((n) => n.classList.remove('uper-keep'));
            if (root) root.classList.remove('uper-speed-root');
            kept = [];

            if (lockVideo && lockVideo !== v) lockVideo.removeEventListener('ratechange', guard);
            if (armed) {
                // 고정: 선택 칸만 남기고 좌상단으로 작게 접힘
                if (!locked) baseRate = origRate;
                locked = true;
                lockIdx = idx;
                lockVideo = v;
                v.removeEventListener('ratechange', guard);
                v.addEventListener('ratechange', guard);
                settle(v, SPEEDS[idx]);
                box.classList.remove('lock');
                box.classList.add('compact');
                paint(idx);
                morphUntil = Date.now() + 500;
                place(v, true, true);           // 줄어들며 좌상단으로 이동
            } else {
                // 고정 안 함 (고정 중이었다면 해제): 원래 배속으로
                const back = locked ? baseRate : origRate;
                if (lockVideo) lockVideo.removeEventListener('ratechange', guard);
                locked = false;
                lockVideo = null;
                settle(v, back);
                box.classList.remove('open', 'lock');
                setTimeout(() => { if (!active && !locked) box.classList.remove('compact'); }, 250);
            }
            armed = false;
            setTimeout(() => { if (!active) setRing(0); }, 500);
        }

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) { finish(); return; }
            const t = e.target;
            if (isOurs(t) || box.contains(t)) return;
            const r0 = playerRoot(t);
            const v = r0 && r0.querySelector('video');
            if (!v) return;
            const p = e.touches[0];
            const vr = v.getBoundingClientRect();
            if (p.clientY < vr.top || p.clientY > vr.bottom) return;

            root = r0;
            video = v;
            origRate = locked ? baseRate : (v.playbackRate || 1);
            start = { x: p.clientX, y: p.clientY };
            lastX = p.clientX;
            clearTimeout(timer);
            timer = setTimeout(begin, SPEED_HOLD_MS);
        }, { capture: true, passive: true });

        document.addEventListener('touchmove', (e) => {
            const p = e.touches[0];
            if (!p || !start) return;
            if (timer) {
                if (Math.hypot(p.clientX - start.x, p.clientY - start.y) > MOVE_LIMIT) {
                    clearTimeout(timer);
                    timer = null;
                }
                return;
            }
            lastX = p.clientX;
            if (!active) return;
            select(indexAt(p.clientX));
            const f = Math.max(0, p.clientY - start.y) / SPEED_LOCK_DY;
            setRing(f);
            setArmed(f >= 1);
        }, { capture: true, passive: true });

        ['touchend', 'touchcancel'].forEach((type) => {
            document.addEventListener(type, () => finish(), { capture: true, passive: true });
        });
        document.addEventListener('contextmenu', blockMenu, true);
        document.addEventListener('visibilitychange', () => { if (document.hidden && active) { armed = locked; finish(); } });
    }

    /* ---------- 전체화면: 영상만 따로 전체화면이 되면 그 위에 아무것도 못 띄우므로,
       플레이어 전체를 전체화면으로 바꿔서 플로팅이 보이게 함 (파이어폭스 등) ---------- */
    function patchVideoFullscreen() {
        const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
        const proto = W.HTMLVideoElement && W.HTMLVideoElement.prototype;
        if (!proto) return;
        ['requestFullscreen', 'mozRequestFullScreen', 'webkitRequestFullscreen'].forEach((name) => {
            const orig = proto[name];
            if (typeof orig !== 'function') return;
            const fn = function () {
                const root = playerRoot(this);
                if (root && root !== this && typeof root[name] === 'function') {
                    return root[name].apply(root, arguments);
                }
                return orig.apply(this, arguments);
            };
            try {
                proto[name] = typeof exportFunction === 'function' ? exportFunction(fn, W) : fn;
            } catch (e) { /* 바꿀 수 없으면 그대로 둠 */ }
        });
    }

    /* ---------- 실행 ---------- */
    try {
        injectStyle();
        buildUI();
        bindPopup();
        bindJar();
        bindHold();
        bindSpeedHold();
        patchVideoFullscreen();
        renderList();
        syncTheme();
        updateLayout();
        setInterval(updateLayout, 500);
        // 테마는 바뀔 때만 다시 계산
        new MutationObserver(syncTheme).observe(document.documentElement, {
            attributes: true, attributeFilter: ['dark', 'darker-dark-theme', 'style']
        });
        if (window.matchMedia) {
            const mq = matchMedia('(prefers-color-scheme: dark)');
            if (mq.addEventListener) mq.addEventListener('change', syncTheme);
        }
        window.addEventListener('yt-navigate-finish', () => { closeSheet(); syncTheme(); updateLayout(); });
    } catch (err) {
        showError('Uper 오류: ' + err.message);
    }
})();
