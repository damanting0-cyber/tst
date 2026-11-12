// ==UserScript==
// @name         Uper
// @namespace    https://github.com/damanting0-cyber/tst
// @version      1.20.1
// @description  영상을 꾹 누르면 섬네일 위에 팝업(링크 복사/다운/팁)이 뜨고, 담은 영상은 팁 유리통(스와이프 삭제/실행 취소)에 모입니다. 영상 페이지에서는 MP3/MP4로 바로 받을 수 있습니다(Termux).
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
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const KEY = 'uper_tip_list';
    const SETTINGS_KEY = 'uper_settings';
    const DEFAULT_SETTINGS = { speedGuides: true, smoothNav: true };
    function getSettings() {
        try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(GM_getValue(SETTINGS_KEY, '{}'))); }
        catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
    }
    function setSetting(k, v) {
        const cur = getSettings();
        cur[k] = v;
        GM_setValue(SETTINGS_KEY, JSON.stringify(cur));
    }
    const HOLD_MS = 500;
    const MOVE_LIMIT = 12;
    const SWIPE_DELETE = 90;
    const SNACK_MS = 6000;
    const FULL_AT = 20;               // 이 개수에서 유리통이 가득 참
    const LINK_SEL = 'a[href*="watch?v="], a[href*="/shorts/"]';
    const CARD_SEL = [
        'ytm-rich-item-renderer', 'ytm-video-with-context-renderer',
        'ytm-compact-video-renderer', 'ytm-compact-autoplay-renderer',
        'ytm-video-renderer', 'ytm-shorts-lockup-view-model',
        'ytm-reel-item-renderer', 'ytd-reel-item-renderer',
        'ytd-rich-item-renderer', 'ytd-video-renderer',
        'ytd-compact-video-renderer', 'yt-lockup-view-model',
        // 채널·재생목록·검색 화면의 카드
        'ytm-playlist-video-renderer', 'ytm-playlist-panel-video-renderer', 'ytm-grid-video-renderer',
        'ytm-media-item', 'ytm-video-card-renderer', 'ytm-shorts-lockup-view-model-v2',
        'ytd-grid-video-renderer', 'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer'
    ].join(',');
    // 패널 안이라도 카드로 다루는 것 (영상 페이지의 재생목록)
    const PANEL_CARD_SEL = 'ytm-playlist-panel-video-renderer, ytd-playlist-panel-video-renderer';
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
    const SPEED_START = 1;            // 고정 기본값 (2×)
    const SPEED_LOCK_DY = 70;         // 홀드한 채 이만큼(px) 아래로 끌면 배속 고정
    const SPEED_HOLD_MS = 450;

    // Material Icons (Apache 2.0) — 유튜브 앱과 같은 계열의 아이콘
    const ICON = {
        link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
        add: 'M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z',
        trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
        close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
        download: 'M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z',
        back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
        edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
        gear: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'
    };
    const JAR_BODY = 'M8 6.5h8v1.2c2.1.8 3.2 2.3 3.2 4.4V18a3 3 0 0 1-3 3H7.8a3 3 0 0 1-3-3v-5.9c0-2.1 1.1-3.6 3.2-4.4z';

    let jar, jarFill, badge, scrim, sheet, sheetCount, listEl, snack, popup, copyBtn, tipBtn;
    let sheetTitle, setEl;
    let popupOpen = false;
    let sheetOpen = false;
    let anchorEl = null;
    let followId = null;
    let pending = null;
    let holdTimer = null;
    let holdStart = null;
    let holdFired = false;
    let justHeld = false;
    let closeTapUntil = 0;       // 팝업을 닫은 그 탭이 영상으로 이동하지 않도록 막는 시각
    let closingTouch = false;    // 지금 터치는 팝업을 닫기 위한 것 (새 롱프레스·기울임을 시작하지 않음)
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

    // 영상 카드 찾기: 아는 카드 태그가 있으면 그것, 없으면 같은 영상만 담고 있는 가장 바깥 상자
    // (화면마다 구조가 달라 썸네일만 기울거나 제목이 빠지던 문제를 통일)
    function findCard(link) {
        const known = link.closest(CARD_SEL);
        if (known) return known;
        const id = idFromHref(link.href);
        let best = link;
        for (let n = link.parentElement, k = 0; n && n !== document.body && k < 6; k++, n = n.parentElement) {
            const r = n.getBoundingClientRect();
            if (r.height > innerHeight * 0.7) break;
            let mixed = false;
            for (const a of n.querySelectorAll(LINK_SEL)) {
                if (idFromHref(a.href) !== id) { mixed = true; break; }
            }
            if (mixed) break;                       // 다른 영상이 섞이면 카드보다 커진 것
            best = n;
        }
        return best;
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
    /* ---------- 애플식 스프링 곡선 ----------
       iOS의 spring(response, dampingFraction)과 같은 물리 곡선을 계산해
       CSS linear() 이징으로 만들어 씀. 시간은 0~1로 정규화해 어떤 길이의 애니메이션에도 같은 느낌.
       linear()를 모르는 브라우저에서는 비슷한 cubic-bezier로 대체. */
    function springCurve(zeta, n) {
        n = n || 40;
        const pts = [];
        if (zeta >= 1) {
            const w = 9;                                   // 임계 감쇠: t=1에서 거의 정지
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                pts.push(1 - (1 + w * t) * Math.exp(-w * t));
            }
        } else {
            const decay = 7;                               // e^-7 ≈ 0.001: t=1에서 흔들림이 사라짐
            const w = decay / zeta;
            const wd = w * Math.sqrt(1 - zeta * zeta);
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                pts.push(1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + (zeta * w / wd) * Math.sin(wd * t)));
            }
        }
        pts[0] = 0;
        pts[n] = 1;
        return 'linear(' + pts.map((v) => +v.toFixed(4)).join(', ') + ')';
    }

    const HAS_LINEAR_EASING = (() => {
        try { return CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch (e) { return false; }
    })();
    const SPRING = HAS_LINEAR_EASING ? {
        smooth: springCurve(0.86),      // 기본: 살짝 탄력 있게 멈춤 (iOS 기본 스프링)
        bouncy: springCurve(0.68),      // 팝업·카드 등장: 톡 튀어나옴
        snappy: springCurve(1)          // 닫힘: 튕김 없이 빠르게
    } : {
        smooth: 'cubic-bezier(.2, .9, .25, 1.05)',
        bouncy: 'cubic-bezier(.2, 1.1, .3, 1.15)',
        snappy: 'cubic-bezier(.25, .9, .3, 1)'
    };

    function injectStyle() {
        const css = `
        :root {
            --uper-ease: ${SPRING.smooth};       /* 기본 스프링 */
            --uper-bounce: ${SPRING.bouncy};     /* 등장: 톡 튀는 스프링 */
            --uper-ease-out: ${SPRING.snappy};   /* 닫힘: 튕김 없는 스프링 */
            --uper-font: "YouTube Sans", Roboto, "Noto Sans KR", Arial, sans-serif;
            --uper-red: #ff0033;
            --uper-sheet: #212121;
            --uper-surface: #272727;
            --uper-glass: rgba(39,39,39,.62);
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
            --uper-glass: rgba(255,255,255,.62);
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
            transition: opacity .18s linear, transform .3s var(--uper-ease-out), visibility 0s .3s;
        }
        #uper-popup.open {
            opacity: 1; transform: none; visibility: visible; pointer-events: auto;
            transition: opacity .15s linear, transform .55s var(--uper-bounce), visibility 0s;
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
            background: var(--uper-glass); color: var(--uper-text);
            -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%);
            box-shadow: 0 2px 8px rgba(0,0,0,.25);
            transition: bottom .3s var(--uper-ease), transform .2s var(--uper-ease), opacity .2s;
        }
        #uper-jar:active { transform: scale(.9); }

        /* ---- 카드 누름 3D 기울임: 카드 판(여백 포함) + 빛 반사 레이어 ---- */
        .uper-tilt-card { isolation: isolate; }
        .uper-tilt-plate, .uper-tilt-light {
            position: absolute; inset: -8px; pointer-events: none;
            border-radius: 16px; opacity: 0;
        }
        .uper-tilt-plate {
            z-index: -1; background: var(--uper-surface);
            box-shadow: 0 6px 18px rgba(0,0,0,.35);
        }
        html.uper-light .uper-tilt-plate { background: #f2f2f2; box-shadow: 0 6px 18px rgba(0,0,0,.12); }
        .uper-tilt-light { z-index: 2147483000; }

        /* ---- 다운 버튼 (영상 페이지에서만, 유리통 왼쪽) ---- */
        #uper-termux {
            position: fixed; right: 76px; bottom: 16px; z-index: 2147483620;
            width: 48px; height: 48px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            background: var(--uper-glass); color: var(--uper-text);
            -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%);
            box-shadow: 0 2px 8px rgba(0,0,0,.25);
            opacity: 0; visibility: hidden; transform: scale(.6);
            transition: bottom .5s var(--uper-ease), transform .35s var(--uper-ease-out),
                opacity .2s, visibility 0s .35s;
        }
        #uper-termux.on {
            opacity: 1; visibility: visible; transform: scale(1);
            transition: bottom .5s var(--uper-ease), transform .55s var(--uper-bounce), opacity .2s, visibility 0s;
        }
        #uper-termux.on:active { transform: scale(.88); }
        #uper-termux.busy svg { animation: uper-termux-pulse .8s ease-in-out infinite; }
        @keyframes uper-termux-pulse { 50% { opacity: .35; transform: translateY(2px); } }

        /* ---- 다운 형식 고르기 / MP4 데이터 주의 ---- */
        #uper-dl-scrim {
            position: fixed; inset: 0; z-index: 2147483638; background: rgba(0,0,0,.5);
            opacity: 0; visibility: hidden; transition: opacity .3s var(--uper-ease-out), visibility 0s .3s;
            -webkit-tap-highlight-color: transparent;
        }
        #uper-dl-scrim.open { opacity: 1; visibility: visible; transition: opacity .35s var(--uper-ease), visibility 0s; }
        #uper-dl {
            position: fixed; left: 50%; bottom: calc(24px + var(--uper-kb, 0px)); z-index: 2147483639;
            max-height: calc(100vh - var(--uper-kb, 0px) - 40px); overflow: auto;
            width: min(360px, calc(100vw - 32px)); box-sizing: border-box; padding: 20px 16px 12px;
            border-radius: 20px; background: var(--uper-sheet); color: var(--uper-text);
            box-shadow: var(--uper-shadow); font-family: var(--uper-font);
            opacity: 0; visibility: hidden; transform: translate(-50%, 40px) scale(.94);
            transform-origin: 50% 100%;
            transition: opacity .2s linear, transform .35s var(--uper-ease-out), visibility 0s .35s,
                bottom .5s var(--uper-ease);
        }
        #uper-dl.open {
            opacity: 1; visibility: visible; transform: translate(-50%, 0);
            transition: opacity .15s linear, transform .6s var(--uper-bounce), visibility 0s,
                bottom .5s var(--uper-ease);
        }
        #uper-dl h2 { margin: 0 4px 4px; font-size: 16px; font-weight: 600; line-height: 22px; }
        #uper-dl p { margin: 0 4px 16px; font-size: 13px; line-height: 19px; color: var(--uper-text2); }
        #uper-dl .opts { display: flex; gap: 8px; }
        #uper-dl .opt {
            flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
            padding: 14px; border-radius: 14px; background: var(--uper-press); text-align: left;
            transition: transform .45s var(--uper-bounce), background-color .15s;
        }
        #uper-dl .opt:active { transform: scale(.95); transition-duration: .2s, .15s; }
        #uper-dl .opt b { font-size: 16px; font-weight: 600; }
        #uper-dl .opt span { font-size: 12px; color: var(--uper-text2); }
        #uper-dl .acts { display: flex; justify-content: flex-end; gap: 4px; margin-top: 12px; }
        #uper-dl .act {
            height: 36px; padding: 0 16px; border-radius: 18px; font-size: 14px; font-weight: 500;
            transition: background-color .15s;
        }
        #uper-dl .act:active { background: var(--uper-press); }
        #uper-dl .act.primary { background: var(--uper-text); color: var(--uper-sheet); }
        #uper-dl label { display: block; margin: 0 4px 10px; font-size: 12px; color: var(--uper-text2); }
        #uper-dl input {
            display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px 12px;
            border: 1px solid var(--uper-divider); border-radius: 10px; background: var(--uper-press);
            color: var(--uper-text); font: 15px/20px var(--uper-font); outline: none;
            transition: border-color .2s;
        }
        #uper-dl input:focus { border-color: var(--uper-text2); }
        .uper-hist .edit {
            flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center; color: var(--uper-text2);
        }
        .uper-hist .edit:active { background: var(--uper-press); }

        /* ---- 다운로드 진행 카드 (버튼 위) ---- */
        #uper-dlprog {
            position: fixed; right: 16px; bottom: 76px; z-index: 2147483621;
            display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
            pointer-events: none; transition: bottom .3s var(--uper-ease);
        }
        .uper-job {
            pointer-events: auto; position: relative; overflow: hidden; box-sizing: border-box;
            width: min(300px, calc(100vw - 32px)); padding: 10px 12px 12px;
            display: flex; flex-direction: column; gap: 8px;
            border-radius: 14px; background: var(--uper-glass); color: var(--uper-text);
            -webkit-backdrop-filter: blur(16px) saturate(160%); backdrop-filter: blur(16px) saturate(160%);
            box-shadow: 0 2px 10px rgba(0,0,0,.25); font-family: var(--uper-font);
            -webkit-tap-highlight-color: transparent;
            animation: uper-job-in .6s var(--uper-bounce) both;
            transition: opacity .3s, transform .3s var(--uper-ease);
        }
        .uper-job.gone { opacity: 0; transform: translateX(24px); }
        @keyframes uper-job-in { from { opacity: 0; transform: translateY(16px) scale(.92); } }
        .uper-job .head { display: flex; align-items: center; gap: 10px; }
        .uper-job .fmt {
            flex-shrink: 0; width: 38px; height: 26px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font: 600 11px/1 var(--uper-font); background: var(--uper-press);
        }
        .uper-job .txt { flex: 1; min-width: 0; }
        .uper-job .ttl {
            font-size: 13px; font-weight: 500; line-height: 18px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .uper-job .sub { font-size: 12px; line-height: 16px; color: var(--uper-text2); }
        .uper-job .pct {
            flex-shrink: 0; min-width: 44px; text-align: right;
            font: 600 17px/1 var(--uper-font); font-variant-numeric: tabular-nums; letter-spacing: -.2px;
        }
        .uper-job.done .pct { color: #2ba640; }
        .uper-job .x {
            flex-shrink: 0; width: 28px; height: 28px; margin: -4px -6px -4px -2px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center; color: var(--uper-text2);
            transition: background-color .15s;
        }
        .uper-job .x:active { background: var(--uper-press); }
        /* 완료 효과: 빛이 한 번 쓸고 지나가고, 퍼센트 자리에 체크가 그려짐 */
        .uper-job .sweep {
            position: absolute; top: 0; bottom: 0; left: -60%; width: 60%; pointer-events: none;
            background: linear-gradient(100deg, transparent, rgba(255,255,255,.22), transparent);
            opacity: 0;
        }
        .uper-job .ok {
            position: absolute; width: 30px; height: 30px; pointer-events: none; opacity: 0;
        }
        .uper-job .ok circle { fill: #2ba640; }
        .uper-job .ok path { fill: none; stroke: #fff; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round;
            stroke-dasharray: 100; stroke-dashoffset: 100; }
        .uper-job .bar {
            position: absolute; left: 0; bottom: 0; height: 3px; width: 100%;
            background: var(--uper-red); transform-origin: left; transform: scaleX(0);
            transition: transform .6s linear, background-color .3s;
        }
        .uper-job.busy .bar { animation: uper-job-busy 1.2s ease-in-out infinite; }
        @keyframes uper-job-busy { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
        .uper-job.done .bar { background: #2ba640; }
        .uper-job.error .bar { background: #888; transform: scaleX(1); }
        .uper-job.error .sub { color: #ff6b6b; }

        /* 단계 체크리스트 */
        .uper-job .steps { display: flex; flex-direction: column; gap: 5px; padding: 2px 2px 0 4px; }
        .uper-step {
            display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 16px;
            color: var(--uper-text2); opacity: .5; transition: opacity .3s, color .3s;
        }
        .uper-step.active { opacity: 1; color: var(--uper-text); }
        .uper-step.done { opacity: .85; }
        .uper-step .lbl { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .uper-step .val { font-variant-numeric: tabular-nums; }
        .uper-step svg { flex-shrink: 0; overflow: visible; }
        .uper-step .trk { fill: none; stroke: currentColor; stroke-width: 1.6; opacity: .35; transition: opacity .3s; }
        .uper-step .arc {
            fill: none; stroke: var(--uper-text); stroke-width: 2; stroke-linecap: round;
            stroke-dasharray: 0 100; transform-origin: 10px 10px; opacity: 0;
            transition: stroke-dasharray .45s var(--uper-ease), stroke .3s, opacity .2s;
        }
        .uper-step.active .arc, .uper-step.done .arc, .uper-step.fail .arc { opacity: 1; }
        .uper-step.active .arc { stroke-dasharray: 28 100; animation: uper-spin .8s linear infinite; }
        .uper-step.done .arc { stroke-dasharray: 100 0; stroke: #2ba640; animation: uper-spin-out .45s var(--uper-ease) both; }
        .uper-step.done .trk { opacity: 0; }
        .uper-step .chk {
            fill: none; stroke: #2ba640; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
            stroke-dasharray: 100; stroke-dashoffset: 100;
            transition: stroke-dashoffset .35s var(--uper-ease) .2s;
        }
        .uper-step.done .chk { stroke-dashoffset: 0; }
        .uper-step.fail { opacity: 1; color: #ff6b6b; }
        .uper-step.fail .arc { stroke-dasharray: 100 0; stroke: #ff6b6b; animation: none; }
        @keyframes uper-spin { to { transform: rotate(360deg); } }
        @keyframes uper-spin-out { from { transform: rotate(-90deg); } to { transform: rotate(0deg); } }
        .uper-job .err { font-size: 11px; line-height: 15px; color: #ff6b6b; padding-left: 30px; }
        #uper-jar.pop { animation: uper-pop .6s var(--uper-bounce); }
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
            transform: scale(0); transition: transform .5s var(--uper-bounce);
        }
        #uper-jar .count.on { transform: scale(1); }
        @keyframes uper-pop {
            0% { transform: scale(1); }
            25% { transform: scale(1.14); }
            100% { transform: scale(1); }
        }

        /* ---- 바텀시트 (유튜브 시트 스타일) ---- */
        #uper-scrim {
            position: fixed; inset: 0; z-index: 2147483630;
            background: rgba(0,0,0,.6); opacity: 0; visibility: hidden;
            transition: opacity .35s var(--uper-ease-out), visibility 0s .35s;
            -webkit-tap-highlight-color: transparent;
        }
        #uper-scrim.open { opacity: 1; visibility: visible; transition: opacity .4s var(--uper-ease), visibility 0s; }

        #uper-sheet {
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483635;
            max-width: 640px; margin: 0 auto; max-height: 75vh;
            display: flex; flex-direction: column;
            background: var(--uper-sheet); color: var(--uper-text);
            border-radius: 12px 12px 0 0; box-shadow: var(--uper-shadow);
            font-family: var(--uper-font);
            padding-bottom: env(safe-area-inset-bottom);
            transform: translateY(100%); visibility: hidden;
            transition: transform .4s var(--uper-ease-out), visibility 0s .4s;
        }
        #uper-sheet.open {
            transform: translateY(0); visibility: visible;
            transition: transform .6s var(--uper-ease), visibility 0s;
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
        #uper-sheet .back { display: none; margin-left: -8px; }
        #uper-sheet.settings .back { display: flex; }
        #uper-sheet.settings .gear, #uper-sheet.settings .head .num { display: none; }
        #uper-sheet .view-set { display: none; }
        #uper-sheet.settings .view-set { display: block; }
        #uper-sheet.settings .view-tips { display: none; }
        .uper-set-sec { padding: 12px 16px 4px; font-size: 12px; font-weight: 600; color: var(--uper-text2); }
        .uper-set-row {
            display: flex; align-items: center; gap: 12px; padding: 10px 16px; min-height: 44px; box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }
        .uper-set-row .t { flex: 1; min-width: 0; }
        .uper-set-row .t b { display: block; font-size: 14px; font-weight: 500; }
        .uper-set-row .t span { display: block; font-size: 12px; color: var(--uper-text2); margin-top: 2px; }
        .uper-switch {
            position: relative; flex-shrink: 0; width: 46px; height: 28px; border-radius: 14px;
            background: var(--uper-press); transition: background-color .3s var(--uper-ease);
        }
        .uper-switch::after {
            content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
            background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35);
            transition: transform .45s var(--uper-bounce);
        }
        .uper-switch.on { background: #2ba640; }
        .uper-switch.on::after { transform: translateX(18px); }
        .uper-hist { display: flex; align-items: center; gap: 10px; padding: 8px 16px; -webkit-tap-highlight-color: transparent; }
        .uper-hist:active { background: var(--uper-press); }
        .uper-hist .fmt {
            flex-shrink: 0; width: 38px; height: 24px; border-radius: 7px; display: flex; align-items: center;
            justify-content: center; font: 600 11px/1 var(--uper-font); background: var(--uper-press);
        }
        .uper-hist .t { flex: 1; min-width: 0; }
        .uper-hist .t b {
            display: block; font-size: 13px; font-weight: 500; line-height: 18px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .uper-hist .t span { display: block; font-size: 12px; color: var(--uper-text2); }
        .uper-hist.err .t span { color: #ff6b6b; }
        .uper-hist-empty { padding: 16px; font-size: 13px; color: var(--uper-text2); }
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
        .uper-sheet-in .uper-row { animation: uper-row-in .55s var(--uper-ease) both; }
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
        html.uper-speed .uper-speed-root :not(.uper-keep, #uper-speed, #uper-speed *, #uper-zones, #uper-zones *, #uper-lockline, #uper-lockline *) {
            opacity: 0 !important; visibility: hidden !important; transition: none !important;
        }
        html.uper-speed .uper-keep::before, html.uper-speed .uper-keep::after { opacity: 0 !important; }

        /* ---- 홀드 중 화면 3등분 영역 표시 (영상 위에만, 손가락 가까이일수록 잘 보임) ---- */
        #uper-zones {
            position: fixed; left: 0; top: 0; width: 100vw; height: 0; z-index: 2147483644;
            display: flex; pointer-events: none; opacity: 0; visibility: hidden;
            --mx: 50%; --my: 50%;
            -webkit-mask-image: radial-gradient(circle 190px at var(--mx) var(--my), #000 0%, rgba(0,0,0,.55) 45%, transparent 100%);
            mask-image: radial-gradient(circle 190px at var(--mx) var(--my), #000 0%, rgba(0,0,0,.55) 45%, transparent 100%);
            transition: opacity .2s linear, visibility 0s .2s;
        }
        #uper-zones.open { opacity: 1; visibility: visible; transition: opacity .2s linear, visibility 0s; }
        #uper-zones > div {
            position: relative; flex: 1; box-sizing: border-box;
            background: rgba(255,255,255,0); transition: background-color .2s;
        }
        #uper-zones > div + div { border-left: 1px dashed rgba(255,255,255,.5); }
        #uper-zones > div.on { background: rgba(255,255,255,.12); }
        #uper-zones span {
            position: absolute; left: 0; right: 0; top: var(--ly, 0px); text-align: center;
            font: 500 13px/1 var(--uper-font); color: rgba(255,255,255,.55); transition: color .2s;
        }
        #uper-zones > div.on span { color: #fff; }

        /* ---- 여기까지 내리면 고정 ---- */
        #uper-lockline {
            position: fixed; left: 0; width: 100vw; top: 0; height: 0; z-index: 2147483644;
            border-top: 1px dashed rgba(255,255,255,.5);
            pointer-events: none; opacity: 0; visibility: hidden;
            transition: opacity .2s linear, visibility 0s .2s, border-color .2s;
        }
        #uper-lockline.open { opacity: 1; visibility: visible; transition: opacity .2s linear, visibility 0s, border-color .2s; }
        #uper-lockline span {
            position: absolute; top: 6px; transform: translateX(-50%);
            padding: 3px 8px; border-radius: 999px; background: rgba(0,0,0,.55);
            font: 500 11px/1 var(--uper-font); color: #fff; white-space: nowrap;
            transition: background-color .2s;
        }
        #uper-lockline.lock { border-top-style: solid; border-color: var(--uper-red); }
        #uper-lockline.lock span { background: var(--uper-red); }

        /* ---- 홀드 배속 플로팅 (영상 위쪽 가운데, 가로 3칸 ↔ 고정 시 현재 배속 1칸) ---- */
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
        #uper-speed.compact { width: 46px; pointer-events: auto; }
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
            opacity: 0; transform: translateY(24px) scale(.96); visibility: hidden; pointer-events: none;
            transform-origin: 50% 100%;
            transition: opacity .2s linear, transform .35s var(--uper-ease-out), visibility 0s .35s, bottom .5s var(--uper-ease);
        }
        #uper-snack.open {
            opacity: 1; transform: none; visibility: visible; pointer-events: auto;
            transition: opacity .15s linear, transform .55s var(--uper-bounce), visibility 0s, bottom .5s var(--uper-ease);
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
        const gearBtn = h('button', { class: 'uper-btn-reset close gear', type: 'button', 'aria-label': '설정' }, icon('gear', 22));
        const backBtn = h('button', { class: 'uper-btn-reset close back', type: 'button', 'aria-label': '뒤로' }, icon('back', 24));
        gearBtn.addEventListener('click', () => showSettings(true));
        backBtn.addEventListener('click', () => showSettings(false));
        sheetTitle = h('span', { text: '팁 유리통' });
        listEl = h('div', { class: 'list view-tips' });
        setEl = h('div', { class: 'list view-set' });
        sheet = h('div', { id: 'uper-sheet', role: 'dialog', 'aria-label': '팁 유리통' },
            h('div', { class: 'grab' }, h('div', { class: 'handle' })),
            h('div', { class: 'head' }, backBtn, h('h2', {}, sheetTitle, sheetCount), gearBtn, closeBtn),
            listEl, setEl
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
        const fab = document.getElementById('uper-termux');
        return popup.contains(t) || jar.contains(t) || sheet.contains(t) || scrim.contains(t) || snack.contains(t) ||
            !!(fab && fab.contains(t)) || !!(dlBox && (dlBox.contains(t) || dlScrim.contains(t))) ||
            !!(progBox && progBox.contains(t));
    }

    // 댓글·설명·패널 안의 링크(타임스탬프 등)는 건드리지 않고, 섬네일 있는 영상 카드만 대상으로 함
    function videoLink(t) {
        const link = t && t.closest ? t.closest(LINK_SEL) : null;
        if (!link) return null;
        if (link.closest(SKIP_SEL) && !link.closest(PANEL_CARD_SEL)) return null;
        if (findCard(link) === link && !link.querySelector('img')) return null;
        return link;
    }

    function bindHold() {
        document.addEventListener('touchstart', (e) => {
            closingTouch = false;
            const t = e.target;
            // 팝업이 열려 있을 때 바깥을 건드리면 그 순간 닫음
            // (click을 기다리면 유튜브가 터치를 가로채 click이 안 오는 경우가 있어 한 번에 안 닫혔음)
            if (popupOpen && !popup.contains(t)) {
                hidePopup();
                closingTouch = true;
                closeTapUntil = Date.now() + 800;
                return;
            }
            if (e.touches.length !== 1) return;
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
            // 팝업 닫으려고 다른 영상을 탭한 경우에만 이동을 막음.
            // 버튼(답글 더보기, 댓글 열기 등)은 그대로 동작하게 둠
            if (Date.now() < closeTapUntil && videoLink(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                closeTapUntil = 0;
                return;
            }
            if (!popupOpen || popup.contains(e.target)) return;
            hidePopup();
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

    // 시트 안에서 팁 목록 ↔ 설정 화면 전환 (스프링으로 옆으로 밀려 들어옴)
    function showSettings(on) {
        if (on === sheet.classList.contains('settings')) return;
        sheet.classList.toggle('settings', on);
        sheetTitle.textContent = on ? '설정' : '팁 유리통';
        const view = on ? setEl : listEl;
        if (on) renderSettings();
        view.animate([{ opacity: 0, transform: `translateX(${on ? 36 : -36}px)` }, { opacity: 1, transform: 'none' }],
            { duration: 550, easing: SPRING.smooth });
    }

    function switchRow(title, desc, key) {
        const sw = h('div', { class: 'uper-switch' + (getSettings()[key] ? ' on' : ''), role: 'switch' });
        const row = h('div', { class: 'uper-set-row' },
            h('div', { class: 't' }, h('b', { text: title }), h('span', { text: desc })), sw);
        bindTap(row, () => {
            const v = !getSettings()[key];
            setSetting(key, v);
            sw.classList.toggle('on', v);
            if (navigator.vibrate) navigator.vibrate(8);
        });
        return row;
    }

    function renderSettings() {
        setEl.textContent = '';
        setEl.append(
            h('div', { class: 'uper-set-sec', text: '화면' }),
            switchRow('배속 홀드 안내선', '꾹 눌러 배속할 때 3등분 점선과 고정선 표시', 'speedGuides'),
            switchRow('영상 이동 애니메이션', '영상을 누르면 섬네일이 커지며 부드럽게 이동', 'smoothNav'),
            h('div', { class: 'uper-set-sec', text: '다운로드 기록' })
        );
        const box = h('div', {}, h('div', { class: 'uper-hist-empty', text: '불러오는 중…' }));
        setEl.appendChild(box);
        fetchServer('/history').then((list) => {
            box.textContent = '';
            if (!list) {
                box.appendChild(h('div', { class: 'uper-hist-empty', text: 'Termux 서버가 꺼져 있어 기록을 불러오지 못했어요' }));
                return;
            }
            if (!list.length) {
                box.appendChild(h('div', { class: 'uper-hist-empty', text: '아직 받은 영상이 없어요' }));
                return;
            }
            list.forEach((it, i) => {
                const d = new Date((it.time || 0) * 1000);
                const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                const ok = it.status === 'done';
                const row = h('div', { class: 'uper-hist' + (ok ? '' : ' err') },
                    h('div', { class: 'fmt', text: (it.format || '').toUpperCase() }),
                    h('div', { class: 't' }, h('b', { text: (it.artist ? it.artist + ' - ' : '') + (it.title || it.url) }),
                        h('span', { text: ok ? `${when} · ${it.format === 'mp4' ? 'Movies' : '노래'} 폴더` : `${when} · 실패` })));
                bindTap(row, () => { closeSheet(); location.href = it.url; });
                if (ok && it.file && it.format !== 'mp4') {
                    const ed = h('button', { class: 'uper-btn-reset edit', type: 'button', 'aria-label': '제목 바꾸기' }, icon('edit', 18));
                    bindTap(ed, () => editTags(it));          // bindTap이 전파를 막아 줄 이동은 안 됨
                    row.appendChild(ed);
                }
                box.appendChild(row);
                row.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
                    { duration: 500, delay: Math.min(i, 10) * 25, easing: SPRING.smooth, fill: 'backwards' });
            });
        });
    }

    function closeSheet() {
        if (!sheetOpen) return;
        sheetOpen = false;
        sheet.style.transform = '';
        scrim.classList.remove('open');
        sheet.classList.remove('open');
        updateLayout();
        // 닫히는 애니메이션이 끝나면 목록과 섬네일을 비우고 팁 목록 화면으로 되돌림
        setTimeout(() => {
            if (sheetOpen) return;
            listEl.textContent = '';
            setEl.textContent = '';
            sheet.classList.remove('settings');
            sheetTitle.textContent = '팁 유리통';
        }, 400);
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
    const isShorts = () => location.pathname.startsWith('/shorts');

    function playerRoot(t, x, y) {
        if (!t || !t.closest) return null;
        for (const s of PLAYER_SEL) {
            const el = t.closest(s);
            if (el) return el;
        }
        // 쇼츠: 손가락 아래에 있는 영상을 품은 가장 가까운 상위 요소
        if (isShorts() && x != null) {
            let n = t;
            let found = null;
            for (let k = 0; n && n !== document.body && k < 15; k++, n = n.parentElement) {
                for (const v of n.querySelectorAll('video')) {
                    const r = v.getBoundingClientRect();
                    if (r.width > 150 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { found = n; break; }
                }
                if (found) break;
            }
            if (!found) return null;
            // 제목·버튼 같은 영상 정보까지 함께 숨기도록, 화면 한 장 크기를 넘지 않는 데까지 넓힘
            let best = found;
            for (let p = found.parentElement, k = 0; p && p !== document.body && k < 8; k++, p = p.parentElement) {
                const r = p.getBoundingClientRect();
                if (r.height > innerHeight * 1.05 || r.width > innerWidth * 1.05) break;
                best = p;
            }
            return best;
        }
        return null;
    }

    // 화면에서 가장 크게 보이는 영상 (쇼츠는 넘길 때마다 영상 요소가 바뀜)
    function mainVideo() {
        let best = null;
        let bestA = 0;
        for (const v of document.querySelectorAll('video')) {
            const r = v.getBoundingClientRect();
            const w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
            const hgt = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
            const a = w > 0 && hgt > 0 ? w * hgt : 0;
            if (a > bestA) { bestA = a; best = v; }
        }
        return best;
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
        // 홀드 중 화면을 3등분한 영역을 보여 줌 (지금 손가락이 있는 칸은 밝게)
        const zones = h('div', { id: 'uper-zones', 'aria-hidden': 'true' });
        const zoneEls = SPEEDS.map(() => {
            const z = h('div');
            zones.appendChild(z);
            return z;
        });
        document.body.insertBefore(zones, box);
        const lockLine = h('div', { id: 'uper-lockline', 'aria-hidden': 'true' });
        document.body.insertBefore(lockLine, box);
        let zoneTop = 0;

        // 영역은 영상 높이만큼만, 고정선은 홀드한 지점에서 일정 거리 아래
        function layoutGuides(vr) {
            zoneTop = Math.max(vr.top, 0);
            zones.style.top = zoneTop + 'px';
            zones.style.height = Math.max(0, Math.min(vr.bottom, innerHeight) - zoneTop) + 'px';
            lockLine.style.top = (start.y + SPEED_LOCK_DY) + 'px';
            moveGuides(start.x, start.y);
        }
        function moveGuides(x, y) {
            zones.style.setProperty('--mx', x + 'px');
            zones.style.setProperty('--my', (y - zoneTop) + 'px');
        }

        function mountBox() {
            const fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement;
            const host = fs && fs.tagName !== 'VIDEO' ? fs : document.body;
            if (box.parentNode !== host) host.appendChild(box);
            if (zones.parentNode !== host) host.insertBefore(zones, box);
            if (lockLine.parentNode !== host) host.insertBefore(lockLine, box);
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
        let swallow = false;   // 유튜브로 터치를 넘기지 않는 중
        let swallowTimer = null;
        let pointerId = null;
        document.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') pointerId = e.pointerId;
        }, { capture: true, passive: true });

        // 유튜브가 진행 중인 길게 누르기를 '취소된 터치'로 알게 함
        function cancelNative(t) {
            if (!t || !t.isConnected) return;
            try {
                t.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true, cancelable: false, composed: true }));
            } catch (e) { /* 지원 안 하면 생략 */ }
            try {
                t.dispatchEvent(new PointerEvent('pointercancel', {
                    bubbles: true, composed: true, pointerId: pointerId == null ? 1 : pointerId,
                    pointerType: 'touch', isPrimary: true
                }));
            } catch (e) { /* 지원 안 하면 생략 */ }
        }
        let lastX = 0;         // 마지막 손가락 x
        let centerX = 0;       // 영상 가운데 x (플로팅 기준)
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
            zoneEls.forEach((z, k) => z.classList.toggle('on', k === i));
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

        // 화면 가로를 3등분: 왼쪽 1.5×, 가운데 2×, 오른쪽 3×
        function indexAt(x) {
            const w = window.innerWidth || document.documentElement.clientWidth || 1;
            const i = Math.floor(x / (w / N));
            return Math.max(0, Math.min(N - 1, i));
        }

        function setArmed(on) {
            if (on === armed) return;
            armed = on;
            box.classList.toggle('lock', on);
            lockLine.classList.toggle('lock', on);
            if (navigator.vibrate) navigator.vibrate(on ? 20 : 8);
        }

        function markKeep() {
            kept = [];
            let n = video;
            while (n && n !== root) { n.classList.add('uper-keep'); kept.push(n); n = n.parentElement; }
            root.classList.add('uper-speed-root');
        }

        // 플로팅은 항상 영상 좌상단
        // 플로팅은 펼쳐졌을 때도, 고정돼 작아졌을 때도 영상 위쪽 가운데
        const FULL_W = 130;
        let morphUntil = 0;    // 이 시각까지는 위치 이동을 애니메이션으로
        function place(v, compact, animate) {
            const r = v.getBoundingClientRect();
            centerX = r.left + r.width / 2;
            const left = centerX - (compact ? 46 : FULL_W) / 2;
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
            const v = mainVideo();
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
            swallow = true;
            layoutGuides(video.getBoundingClientRect());
            if (getSettings().speedGuides) {               // 설정에서 끌 수 있음
                zones.classList.add('open');
                lockLine.classList.remove('lock');
                lockLine.classList.add('open');
            }
            cancelNative(start.t);

            mountBox();
            const fromCompact = wasLocked && box.classList.contains('open');
            morphUntil = Date.now() + 500;
            place(video, false, fromCompact);   // 작은 플로팅이었다면 그 자리에서 양옆으로 펼쳐짐
            setRing(0);
            idx = indexAt(lastX);
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
            clearTimeout(swallowTimer);
            swallowTimer = setTimeout(() => { swallow = false; }, 400);   // 뒤따라오는 click까지 막음
            zones.classList.remove('open');
            lockLine.classList.remove('open');
            const v = video;
            v.removeEventListener('ratechange', guard);
            if (!shortsGuard) document.removeEventListener('touchmove', blockMove, { capture: true });
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
                place(v, true, true);           // 가운데에서 한 칸으로 줄어듦
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
            if (!active) { swallow = false; clearTimeout(swallowTimer); }
            if (isOurs(t) || box.contains(t)) return;
            const p = e.touches[0];
            const r0 = playerRoot(t, p.clientX, p.clientY);
            if (!r0) return;
            let v = null;
            for (const c of r0.querySelectorAll('video')) {
                const cr = c.getBoundingClientRect();
                if (p.clientY >= cr.top && p.clientY <= cr.bottom && cr.width > 0) { v = c; break; }
            }
            if (!v) return;

            root = r0;
            video = v;
            origRate = locked ? baseRate : (v.playbackRate || 1);
            start = { x: p.clientX, y: p.clientY, t };
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
            moveGuides(p.clientX, p.clientY);
            const f = Math.max(0, p.clientY - start.y) / SPEED_LOCK_DY;
            setRing(f);
            setArmed(f >= 1);
        }, { capture: true, passive: true });

        ['touchend', 'touchcancel'].forEach((type) => {
            document.addEventListener(type, (e) => { if (e.isTrusted) finish(); }, { capture: true, passive: true });
        });
        document.addEventListener('contextmenu', blockMenu, true);

        // 쇼츠에서는 스크롤(다음 영상 넘김)이 터치 시작부터 결정되므로,
        // 쇼츠 페이지에서만 미리 막을 수 있는 리스너를 걸어 두고 홀드 중일 때만 막음
        let shortsGuard = false;
        function syncShortsGuard() {
            const want = isShorts();
            if (want === shortsGuard) return;
            shortsGuard = want;
            if (want) document.addEventListener('touchmove', blockMove, { capture: true, passive: false });
            else document.removeEventListener('touchmove', blockMove, { capture: true });
        }
        syncShortsGuard();
        window.addEventListener('yt-navigate-finish', syncShortsGuard);
        setInterval(syncShortsGuard, 1000);

        // 홀드 중과 손을 뗀 직후의 터치는 유튜브에 넘기지 않음
        // (유튜브가 길게 누르기·탭으로 받아 영상 정보를 올리거나 일시정지하지 않도록)
        ['touchmove', 'touchend', 'touchcancel', 'pointermove', 'pointerup', 'pointercancel',
            'mousedown', 'mouseup', 'click', 'contextmenu'].forEach((type) => {
            document.addEventListener(type, (e) => {
                if (swallow && e.isTrusted) e.stopPropagation();
            }, { capture: true, passive: true });
        });
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

    /* ---------- 영상 카드 누름 3D 기울임 ----------
       누른 곳이 화면 안쪽으로 들어가듯 기울고(가장자리 최대 15°, 크기 최대 -5%),
       손을 떼면 눌린 만큼에서 튕김 없이 돌아오고, 꾹 누르기가 되면 톡 올라옴.
       Web Animations API로 transform만 움직이고, 누르는 동안만 will-change. */
    const TILT_DEG = 6;
    const TILT_SCALE = 0.03;
    const TILT_PAD = 8;              // 카드 판이 내용보다 바깥으로 나오는 여백(px)
    const TILT_PRESS_MS = 440;
    const TILT_HOLD_MS = 450;
    const TILT_MOVE = 8;
    const TILT_PERSP = 2.4;
    // 이만큼 손가락이 머물러야 눌림 시작 (스크롤하려고 닿은 손가락엔 반응 안 함). 홈은 스크롤이 많아 더 길게
    const tiltDelay = () => (location.pathname === '/' || location.pathname === '' ? 200 : 120);
    const TILT_AFTER_SCROLL = 300;   // 스크롤(관성 포함) 직후 이 시간 안의 터치는 스크롤을 멈추려는 터치로 봄

    function bindPressTilt() {
        const easeOut = (t) => 1 - Math.pow(1 - t, 3);               // = cubic-bezier(.33, 1, .68, 1)
        const state = new WeakMap();                                  // 카드 → 진행 상태
        const plateOp = (p) => Math.min(1, Math.max(0, p) * 1.6);     // 판은 눌리는 만큼 서서히 나타남
        let cur = null;                                               // 지금 누르고 있는 카드
        let start = null;
        let holdTimer = null;

        function frame(st, p) {
            return {
                transform: `perspective(${st.persp}px) rotateX(${(-st.ny * TILT_DEG * p).toFixed(3)}deg) ` +
                    `rotateY(${(st.nx * TILT_DEG * p).toFixed(3)}deg) scale(${(1 - TILT_SCALE * p).toFixed(4)})`
            };
        }

        // 지금 눌린 정도(0~1, 꾹 누르기 반동 때는 잠깐 음수)
        function progress(st) {
            if (!st || !st.fn) return 0;
            const t = Math.min(performance.now() - st.t0, st.dur);
            return st.fn(t);
        }

        // p(t) 함수를 따라 transform·빛을 움직임
        function run(card, st, fn, dur, opts) {
            if (st.anim) st.anim.cancel();
            if (st.lightAnim) st.lightAnim.cancel();
            if (st.plateAnim) st.plateAnim.cancel();
            st.fn = fn;
            st.t0 = performance.now();
            st.dur = dur;
            if (opts && opts.easing) {
                // 누를 때: 시작·끝 두 프레임 + 브라우저 이징 (가장 부드러움)
                st.anim = card.animate([frame(st, fn(0)), frame(st, fn(dur))],
                    { duration: dur, easing: opts.easing, fill: 'forwards' });
                st.lightAnim = st.light.animate([{ opacity: Math.max(0, fn(0)) }, { opacity: Math.max(0, fn(dur)) }],
                    { duration: dur, easing: opts.easing, fill: 'forwards' });
                st.plateAnim = st.plate.animate([{ opacity: plateOp(fn(0)) }, { opacity: plateOp(fn(dur)) }],
                    { duration: dur, easing: opts.easing, fill: 'forwards' });
            } else {
                // 스프링: 곡선을 촘촘히 잘라서 그대로 재생
                const n = 24;
                const kf = [];
                const lf = [];
                for (let i = 0; i <= n; i++) {
                    const p = fn(dur * i / n);
                    kf.push(frame(st, p));
                    lf.push({ opacity: Math.max(0, p) });
                }
                st.anim = card.animate(kf, { duration: dur, easing: 'linear', fill: 'forwards' });
                st.lightAnim = st.light.animate(lf, { duration: dur, easing: 'linear', fill: 'forwards' });
                st.plateAnim = st.plate.animate(lf.map((f) => ({ opacity: plateOp(f.opacity) })),
                    { duration: dur, easing: 'linear', fill: 'forwards' });
            }
            return st.anim;
        }

        function cleanup(card, st) {
            if (st.anim) st.anim.cancel();
            if (st.lightAnim) st.lightAnim.cancel();
            if (st.plateAnim) st.plateAnim.cancel();
            st.anim = st.lightAnim = st.plateAnim = null;
            st.fn = null;
            card.style.willChange = '';
            if (st.light.isConnected) st.light.remove();
            if (st.plate && st.plate.isConnected) st.plate.remove();
            card.classList.remove('uper-tilt-card');
            if (st.saved) {
                card.style.position = st.saved.position;
                card.style.overflow = st.saved.overflow;
                st.saved = null;
            }
            state.delete(card);
        }

        // 손을 떼면: 지금 눌린 만큼에서 튕김 없이(임계 감쇠 스프링) 돌아옴
        function release(card) {
            const st = state.get(card);
            if (!st) return;
            const p0 = progress(st);
            const w = 15;                                              // 고유 진동수 (1/s)
            const dur = 480;
            const anim = run(card, st, (t) => {
                const k = w * t / 1000;
                return p0 * (1 + k) * Math.exp(-k);
            }, dur);
            anim.onfinish = () => { if (state.get(card) === st && st.anim === anim) cleanup(card, st); };
        }

        // 꾹 누르기: 바닥에서 살짝 넘치듯 톡 올라옴 (감쇠가 약한 스프링)
        function pop(card) {
            const st = state.get(card);
            if (!st) return;
            const p0 = progress(st);
            const w = 22;
            const z = 0.55;                                            // 감쇠비 < 1 → 한 번 살짝 넘침
            const wd = w * Math.sqrt(1 - z * z);
            const dur = 520;
            st.popped = true;
            const anim = run(card, st, (t) => {
                const s = t / 1000;
                return p0 * Math.exp(-z * w * s) * (Math.cos(wd * s) + (z * w / wd) * Math.sin(wd * s));
            }, dur);
            anim.onfinish = () => { if (state.get(card) === st && st.anim === anim) cleanup(card, st); };
        }

        function press(card, x, y) {
            const r = card.getBoundingClientRect();
            if (r.width < 40 || r.height < 40) return false;
            const old = state.get(card);
            const p0 = old ? progress(old) : 0;
            if (old) {
                if (old.anim) old.anim.cancel();
                if (old.lightAnim) old.lightAnim.cancel();
                if (old.plateAnim) old.plateAnim.cancel();
            }

            // 누른 위치 (-1 ~ 1, 가장자리가 ±1)
            const nx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (r.width / 2)));
            const ny = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / (r.height / 2)));
            const st = old || {};
            st.nx = nx;
            st.ny = ny;
            st.persp = Math.round((Math.max(r.width, r.height) + TILT_PAD * 2) * TILT_PERSP);
            st.popped = false;

            // 빛: 누른 반대쪽 위에 흰 빛, 누른 쪽에 옅은 그늘
            if (!st.light) st.light = h('div', { class: 'uper-tilt-light', 'aria-hidden': 'true' });
            if (!st.plate) st.plate = h('div', { class: 'uper-tilt-plate', 'aria-hidden': 'true' });
            const hx = 50 - nx * 45;
            const hy = Math.max(0, 50 - ny * 45 - 25);
            const sx = 50 + nx * 50;
            const sy = 50 + ny * 50;
            st.light.style.background =
                `radial-gradient(circle at ${hx}% ${hy}%, rgba(255,255,255,.22), rgba(255,255,255,0) 55%),` +
                `radial-gradient(circle at ${sx}% ${sy}%, rgba(0,0,0,.18), rgba(0,0,0,0) 60%)`;
            const cs = getComputedStyle(card);
            if (!st.saved) {
                st.saved = { position: card.style.position, overflow: card.style.overflow };
                if (cs.position === 'static') card.style.position = 'relative';
                // 판의 여백이 카드 경계에서 잘리지 않도록
                if (cs.overflow !== 'visible') card.style.overflow = 'visible';
            }
            card.classList.add('uper-tilt-card');
            if (!st.plate.isConnected) card.insertBefore(st.plate, card.firstChild);
            if (!st.light.isConnected) card.appendChild(st.light);
            card.style.willChange = 'transform';
            state.set(card, st);

            // 지금 눌린 정도에서 바닥(1)까지 ease-out
            const span = Math.max(0, 1 - p0);
            run(card, st, (t) => p0 + span * easeOut(t / TILT_PRESS_MS), TILT_PRESS_MS,
                { easing: 'cubic-bezier(.33, 1, .68, 1)' });
            return true;
        }

        function end() {
            clearTimeout(holdTimer);
            holdTimer = null;
            if (!cur) return;
            const card = cur;
            cur = null;
            start = null;
            const st = state.get(card);
            if (st && !st.popped) release(card);
        }

        let pressTimer = null;       // 눌림 시작 대기
        let lastScroll = -Infinity;

        function cancelPending() {
            clearTimeout(pressTimer);
            pressTimer = null;
        }

        document.addEventListener('touchstart', (e) => {
            cancelPending();
            if (e.touches.length !== 1) { end(); return; }
            if (closingTouch) return;
            // 스크롤이 막 움직이던 중이면 스크롤을 멈추려는 터치 → 카드를 누르지 않음
            if (performance.now() - lastScroll < TILT_AFTER_SCROLL) return;
            const t = e.target;
            if (isOurs(t)) return;
            const link = videoLink(t);
            if (!link) return;
            const card = findCard(link);
            const p = e.touches[0];
            if (cur && cur !== card) end();
            start = { x: p.clientX, y: p.clientY };
            const px = p.clientX;
            const py = p.clientY;
            const delay = tiltDelay();
            // 손가락이 잠깐 머물렀을 때만 눌림 시작 (스크롤하려고 스친 손가락엔 색·기울기가 번쩍이지 않게)
            pressTimer = setTimeout(() => {
                pressTimer = null;
                if (!start || !press(card, px, py)) return;
                cur = card;
                clearTimeout(holdTimer);
                holdTimer = setTimeout(() => {
                    holdTimer = null;
                    if (cur === card) pop(card);
                }, Math.max(60, TILT_HOLD_MS - delay));
            }, delay);
        }, { capture: true, passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!start) return;
            const p = e.touches[0];
            // 눌림 시작 전에는 조금만 움직여도(5px) 스크롤로 봄, 눌린 뒤에는 8px
            if (p && Math.hypot(p.clientX - start.x, p.clientY - start.y) > (pressTimer ? 5 : TILT_MOVE)) {
                cancelPending();
                start = null;
                end();                                              // 눌린 만큼에서 부드럽게 풀림
            }
        }, { capture: true, passive: true });

        ['touchend', 'touchcancel'].forEach((type) => {
            document.addEventListener(type, () => {
                cancelPending();
                start = null;
                end();
            }, { capture: true, passive: true });
        });
        window.addEventListener('scroll', () => {
            lastScroll = performance.now();
            if (pressTimer) { cancelPending(); start = null; }
            if (cur) end();
        }, { passive: true, capture: true });
    }

    /* ---------- 영상 이동 애니메이션 ----------
       카드를 누르면 바로 페이지를 바꾸지 않고, 섬네일이 플레이어 자리로 커지며 화면이 덮인 뒤
       이동하고, 새 페이지가 준비되면 덮개가 스르륵 사라짐. */
    let navPass = false;

    function bindSmoothNav() {
        document.addEventListener('click', (e) => {
            if (navPass || e.defaultPrevented || e.button !== 0) return;
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            if (!getSettings().smoothNav) return;
            if (isOurs(e.target)) return;
            const link = videoLink(e.target);
            if (!link || link.target === '_blank') return;
            const id = idFromHref(link.href);
            if (!id) return;
            e.preventDefault();
            e.stopPropagation();
            playNav(link, id);
        }, true);
    }

    function playNav(link, id) {
        const shorts = isShortsLink(link);
        const thumb = findThumb(link);
        const from = (thumb && thumb.tagName === 'IMG' ? thumb : findCard(link)).getBoundingClientRect();
        const bg = getComputedStyle(document.body).backgroundColor;
        const startHref = location.href;

        const veil = h('div', { 'aria-hidden': 'true',
            style: `position:fixed;inset:0;z-index:2147483600;pointer-events:none;background:${bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : 'var(--uper-sheet)'};opacity:0;` });
        const img = h('img', { alt: '', 'aria-hidden': 'true',
            style: `position:fixed;z-index:2147483601;pointer-events:none;object-fit:cover;left:0;top:0;` +
                `width:${from.width}px;height:${from.height}px;border-radius:12px;` +
                `transform:translate(${from.left}px,${from.top}px);transform-origin:0 0;will-change:transform;` });
        img.src = (thumb && thumb.tagName === 'IMG' && thumb.currentSrc) || `https://i.ytimg.com/vi/${id}/${shorts ? 'hqdefault' : 'mqdefault'}.jpg`;
        document.body.append(veil, img);

        // 목표: 일반 영상은 화면 위쪽 플레이어 자리(16:9), 쇼츠는 화면 전체
        const header = document.querySelector('ytm-mobile-topbar-renderer, #masthead-container, header');
        const top = shorts ? 0 : Math.max(0, Math.min(64, header ? header.getBoundingClientRect().bottom : 48));
        const tw = innerWidth;
        const th = shorts ? innerHeight : innerWidth * 9 / 16;
        const sx = tw / from.width;
        const sy = th / from.height;

        veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: SPRING.snappy, fill: 'forwards' });
        img.animate([
            { transform: `translate(${from.left}px,${from.top}px) scale(1,1)`, borderRadius: '12px' },
            { transform: `translate(0px,${top}px) scale(${sx},${sy})`, borderRadius: '0px' }
        ], { duration: 560, easing: SPRING.smooth, fill: 'forwards' });

        // 커지는 중간에 실제 이동 시작 (유튜브의 페이지 전환을 그대로 사용)
        setTimeout(() => {
            navPass = true;
            try { link.click(); } finally { navPass = false; }
            setTimeout(() => { if (location.href === startHref) location.href = link.href; }, 1200);
        }, 220);

        // 새 페이지가 준비되면(주소가 바뀌고 영상이 생기면) 덮개를 걷음
        const t0 = performance.now();
        const reveal = () => {
            const moved = location.href !== startHref;
            const ready = moved && document.querySelector('video');
            if (!(ready || performance.now() - t0 > 2500)) { setTimeout(reveal, 80); return; }
            setTimeout(() => {
                img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: SPRING.snappy, fill: 'forwards' });
                const a = veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, easing: SPRING.snappy, fill: 'forwards' });
                a.onfinish = () => { veil.remove(); img.remove(); };
            }, 120);
        };
        setTimeout(reveal, 400);
    }

    /* ---------- Termux로 보내기 ----------
       Termux에서 돌고 있는 작은 서버(termux/uper-server.py, 127.0.0.1:8765)에 영상 주소를 넘기면
       서버가 ~/bin/termux-url-opener 를 실행 → 공유창 없이 바로 저장 시작.
       서버가 꺼져 있으면 공유창 → 그것도 안 되면 클립보드 복사.

       참고: intent URI로 Termux 공유 화면을 직접 여는 방식은 쓰지 않음.
       안드로이드 브라우저(파이어폭스 포함)는 보안상 intent의 component 지정을 지우고
       '웹 링크로 열 수 있는(BROWSABLE)' 앱만 열어 주는데, Termux 공유 화면은 그렇지 않아서 실패하고,
       실패 과정에서 페이지 이동이 일어나 화면이 비는 현상이 있었음. */
    const TERMUX_LOG = '[Uper/Termux]';
    const TERMUX_SERVER = 'http://127.0.0.1:8765';
    const TERMUX_TIMEOUT_MS = 1500;
    const ID_RE = /^[\w-]{11}$/;

    // 지금 보고 있는 영상 ID (클릭 시점의 주소에서 읽음 → 유튜브 페이지 이동 후에도 최신)
    function currentVideoId() {
        try {
            const u = new URL(location.href);
            const v = u.searchParams.get('v');
            if (v && ID_RE.test(v)) return v;
            const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})/);
            if (m) return m[1];
        } catch (e) { /* 아래로 */ }
        return null;
    }

    // 재생목록·타임스탬프 등 파라미터를 버린 깔끔한 주소
    function cleanWatchUrl(id) {
        return 'https://www.youtube.com/watch?v=' + id;
    }

    // Termux 서버로 전송. 성공하면 true
    function sendViaServer(url, format, meta) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                console.warn(TERMUX_LOG, 'GM_xmlhttpRequest 없음 (스크립트를 다시 설치해 권한을 받아야 함)');
                resolve({ ok: false, why: 'perm' });
                return;
            }
            const t0 = Date.now();
            GM_xmlhttpRequest({
                method: 'GET',
                url: TERMUX_SERVER + '/send?url=' + encodeURIComponent(url) + '&format=' + format +
                    (meta && meta.title ? '&title=' + encodeURIComponent(meta.title) : '') +
                    (meta && meta.artist ? '&artist=' + encodeURIComponent(meta.artist) : ''),
                headers: { 'X-Uper': '1' },          // 다른 웹페이지가 서버를 함부로 부르지 못하게
                timeout: TERMUX_TIMEOUT_MS,
                onload: (r) => {
                    console.log(TERMUX_LOG, `서버 응답 ${r.status} (${Date.now() - t0}ms):`, (r.responseText || '').slice(0, 200));
                    // status 0: Tampermonkey가 127.0.0.1 접속을 허용받지 못함
                    resolve({ ok: r.status === 200, why: r.status === 0 ? 'perm' : 'http', status: r.status,
                        text: (r.responseText || '').slice(0, 80) });
                },
                onerror: (e) => {
                    console.warn(TERMUX_LOG, `서버 연결 실패 (${Date.now() - t0}ms) — Termux에서 uper-server.py가 안 돌고 있음`, e && e.error);
                    const err = String((e && e.error) || '');
                    resolve({ ok: false, why: /refused to connect|@connect|blacklist|not (allowed|permitted)/i.test(err) ? 'perm' : 'down', text: err });
                },
                ontimeout: () => {
                    console.warn(TERMUX_LOG, `서버 응답 없음 (${TERMUX_TIMEOUT_MS}ms 초과)`);
                    resolve({ ok: false, why: 'timeout' });
                }
            });
        });
    }

    /* ---- 다운로드 진행률: 서버의 /status를 받아 버튼 위 카드로 표시 ---- */
    let progBox = null;
    let pollTimer = null;
    let pollFails = 0;
    const jobEls = new Map();          // 작업 id → 카드
    const dismissed = new Set();

    function serverGet(path) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            GM_xmlhttpRequest({
                method: 'GET', url: TERMUX_SERVER + path, headers: { 'X-Uper': '1' }, timeout: 15000,
                onload: (r) => { try { resolve({ status: r.status, data: JSON.parse(r.responseText) }); } catch (e) { resolve({ status: r.status, data: null }); } },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    function fetchServer(path) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            GM_xmlhttpRequest({
                method: 'GET', url: TERMUX_SERVER + path, headers: { 'X-Uper': '1' }, timeout: 3000,
                onload: (r) => {
                    try { resolve(r.status === 200 ? JSON.parse(r.responseText).items : null); } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    function fetchStatus() {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            GM_xmlhttpRequest({
                method: 'GET', url: TERMUX_SERVER + '/status', headers: { 'X-Uper': '1' }, timeout: 3000,
                onload: (r) => {
                    try { resolve(r.status === 200 ? JSON.parse(r.responseText).jobs : null); } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    }

    // 다운로드 단계 (서버의 stage와 같은 이름)
    const JOB_STEPS = {
        m4a: [['info', '영상 정보 확인'], ['thumb', '섬네일 받기'], ['dl', 'M4A 받기'],
            ['meta', '제목·정보 넣기'], ['embed', '섬네일 넣기'], ['save', '노래 폴더 저장 · 삼성뮤직 등록']],
        mp4: [['info', '영상 정보 확인'], ['dl', '영상 받기'], ['audio', '소리 받기'],
            ['merge', '영상·소리 합치기'], ['save', 'Movies 폴더 저장 · 갤러리 등록']]
    };
    JOB_STEPS.mp3 = JOB_STEPS.m4a.map(([k, l]) => [k, k === 'dl' ? 'MP3 받기' : l]);

    // 예전 서버(stage 없음)용 추정
    function stageOf(j) {
        if (j.stage) return j.stage;
        if (j.status === 'done') return 'done';
        if (j.status === 'saving') return 'save';
        if (j.status === 'converting') return j.format === 'mp4' ? 'merge' : 'meta';
        if (j.status === 'downloading') return j.format === 'mp4' && j.part > 1 ? 'audio' : 'dl';
        return 'info';
    }

    function stepIcon() {
        return svgEl('svg', { viewBox: '0 0 20 20', width: '18', height: '18', 'aria-hidden': 'true' },
            svgEl('circle', { class: 'trk', cx: '10', cy: '10', r: '8' }),
            svgEl('circle', { class: 'arc', cx: '10', cy: '10', r: '8', pathLength: '100' }),
            svgEl('path', { class: 'chk', d: 'M6.2 10.4l2.5 2.5 5.2-5.4', pathLength: '100' }));
    }

    function buildSteps(fmt) {
        const box = h('div', { class: 'steps' });
        for (const [key, label] of (JOB_STEPS[fmt] || JOB_STEPS.m4a)) {
            const row = h('div', { class: 'uper-step', 'data-k': key },
                stepIcon(), h('span', { class: 'lbl', text: label }), h('span', { class: 'val' }));
            box.appendChild(row);
        }
        return box;
    }

    function paintSteps(el, j) {
        const steps = JOB_STEPS[j.format] || JOB_STEPS.m4a;
        const stage = stageOf(j);
        const cur = stage === 'done' ? steps.length : Math.max(0, steps.findIndex(([k]) => k === stage));
        el.querySelectorAll('.uper-step').forEach((row, i) => {
            const fail = j.status === 'error' && i === cur;
            row.classList.toggle('done', i < cur);
            row.classList.toggle('active', i === cur && !fail);
            row.classList.toggle('fail', fail);
            const k = row.dataset.k;
            const val = row.querySelector('.val');
            val.textContent = i === cur && !fail && (k === 'dl' || k === 'audio') && j.percent != null
                ? Math.floor(j.percent) + '%' : (i === cur && !fail ? '…' : '');
        });
    }

    function jobText(j) {
        const part = j.format === 'mp4' && j.part > 1 ? ' · 소리' : (j.format === 'mp4' ? ' · 영상' : '');
        switch (j.status) {
            case 'starting': return '준비 중…';
            case 'downloading': return '받는 중' + part + (j.eta && j.eta !== 'Unknown' ? ` · 남은 시간 ${j.eta}` : '');
            case 'converting': return j.format === 'mp4' ? '영상과 소리 합치는 중…' : '정리 중…';
            case 'saving': return '저장 중…';
            case 'done': return (j.format === 'mp4' ? 'Movies' : '노래') + ' 폴더에 저장했어요';
            case 'error': return '실패했어요';
            default: return j.status;
        }
    }

    function renderJobs(list) {
        const seen = new Set();
        for (const j of list) {
            if (dismissed.has(j.id)) continue;
            seen.add(j.id);
            let el = jobEls.get(j.id);
            if (!el) {
                // 페이지를 열기 전에 이미 끝난 작업은 보이지 않음
                if ((j.status === 'done' || j.status === 'error') && !pollTimer) continue;
                el = h('div', { class: 'uper-job', role: 'status' },
                    h('div', { class: 'head' },
                        h('div', { class: 'fmt', text: j.format.toUpperCase() }),
                        h('div', { class: 'txt' }, h('div', { class: 'ttl' }), h('div', { class: 'sub' })),
                        h('div', { class: 'pct' }),
                        h('button', { class: 'uper-btn-reset x', type: 'button', 'aria-label': '닫기' }, icon('close', 18))),
                    buildSteps(j.format),
                    h('div', { class: 'err' }),
                    h('div', { class: 'bar' }));
                bindTap(el.querySelector('.x'), () => dismissJob(j.id));     // 카드를 눌러서는 안 닫힘
                progBox.appendChild(el);
                jobEls.set(j.id, el);
            }
            el.querySelector('.ttl').textContent = j.title || '영상 정보 가져오는 중…';
            el.querySelector('.sub').textContent = jobText(j);
            paintSteps(el, j);
            el.querySelector('.err').textContent = j.status === 'error'
                ? (j.error || '').replace(/^ERROR:\s*/, '').slice(0, 90) : '';
            const p = j.status === 'done' ? 100 : (j.percent || 0);
            // MP4는 영상·소리 두 번 받으므로 전체 진행률을 반씩 나눠 표시
            const whole = j.format === 'mp4' && j.status === 'downloading'
                ? (j.part > 1 ? 50 + p / 2 : p / 2) : p;
            const wp = Math.max(0, Math.min(100, whole));
            el.querySelector('.bar').style.transform = `scaleX(${wp / 100})`;
            el.querySelector('.pct').textContent =
                j.status === 'error' ? '' : (j.status === 'starting' && !j.percent ? '0%' : Math.floor(wp) + '%');
            el.classList.toggle('busy', ['starting', 'converting', 'saving'].includes(j.status));
            el.classList.toggle('done', j.status === 'done');
            el.classList.toggle('error', j.status === 'error');
            if (j.status === 'done' && !el.dataset.cheer) {
                el.dataset.cheer = '1';
                celebrate(el);
            }
            if ((j.status === 'done' || j.status === 'error') && !el.dataset.bye) {
                el.dataset.bye = '1';
                setTimeout(() => dismissJob(j.id), j.status === 'done' ? 3000 : 10000);
            }
        }
        // 서버 목록에서 빠진 카드 정리
        for (const [id] of jobEls) if (!seen.has(id)) dismissJob(id);
    }

    // 다운로드 완료: 카드가 톡 튀고 초록빛 테두리가 퍼지며, 빛이 쓸고 지나가고, 퍼센트가 체크로 바뀜
    function celebrate(el) {
        el.style.animation = 'none';
        el.animate([
            { transform: 'scale(1)', boxShadow: '0 2px 10px rgba(0,0,0,.25), 0 0 0 0 rgba(43,166,64,.55)' },
            { transform: 'scale(1.035)', boxShadow: '0 6px 22px rgba(0,0,0,.3), 0 0 0 6px rgba(43,166,64,.25)', offset: .35 },
            { transform: 'scale(1)', boxShadow: '0 2px 10px rgba(0,0,0,.25), 0 0 0 14px rgba(43,166,64,0)' }
        ], { duration: 900, easing: SPRING.bouncy });

        const sweep = h('div', { class: 'sweep' });
        el.appendChild(sweep);
        sweep.animate([{ left: '-60%', opacity: 1 }, { left: '110%', opacity: 1 }],
            { duration: 750, delay: 120, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => sweep.remove();

        const pct = el.querySelector('.pct');
        if (pct) {
            const ok = svgEl('svg', { class: 'ok', viewBox: '0 0 30 30', 'aria-hidden': 'true' },
                svgEl('circle', { cx: '15', cy: '15', r: '15' }),
                svgEl('path', { d: 'M9 15.5l4 4 8-8.5', pathLength: '100' }));
            el.querySelector('.head').appendChild(ok);
            const pr = pct.getBoundingClientRect();
            const hr = el.getBoundingClientRect();
            ok.style.left = (pr.right - hr.left - 30) + 'px';
            ok.style.top = (pr.top - hr.top + pr.height / 2 - 15) + 'px';
            pct.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6)' }],
                { duration: 250, easing: SPRING.snappy, fill: 'forwards' });
            ok.animate([{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }],
                { duration: 600, delay: 150, easing: SPRING.bouncy, fill: 'forwards' });
            ok.querySelector('path').animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }],
                { duration: 380, delay: 380, easing: SPRING.smooth, fill: 'forwards' });
        }
        if (navigator.vibrate) navigator.vibrate([12, 60, 18]);
    }

    function dismissJob(id) {
        dismissed.add(id);
        const el = jobEls.get(id);
        if (!el) return;
        jobEls.delete(id);
        const hgt = el.offsetHeight;
        el.style.animation = 'none';
        el.style.pointerEvents = 'none';
        const a = el.animate([
            { opacity: 1, transform: 'scale(1)', height: hgt + 'px', marginBottom: '0px' },
            { opacity: 0, transform: 'scale(.9)', height: hgt + 'px', marginBottom: '0px', offset: 0.45 },
            { opacity: 0, transform: 'scale(.9)', height: '0px', marginBottom: '-8px',
                paddingTop: '0px', paddingBottom: '0px' }       // 간격(8px)까지 접어서 다른 카드가 매끄럽게 내려옴
        ], { duration: 520, easing: SPRING.snappy, fill: 'forwards' });
        a.onfinish = () => el.remove();
    }

    // 진행 중인 작업이 있을 때만 1초마다 확인 (없으면 멈춰서 배터리·트래픽 아낌)
    async function watchJobs(started) {
        if (started) pollFails = 0;
        clearTimeout(pollTimer);
        pollTimer = null;
        const list = await fetchStatus();
        if (!list) {
            if (started || ++pollFails < 3) pollTimer = setTimeout(() => watchJobs(false), 1500);
            return;
        }
        pollFails = 0;
        if (started || list.some((j) => !['done', 'error'].includes(j.status))) {
            pollTimer = setTimeout(() => watchJobs(false), 1000);
        }
        renderJobs(list);
        if (!list.some((j) => !['done', 'error'].includes(j.status))) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
    }

    let termuxBusy = false;

    async function sendToTermux(url, format, btn, meta) {
        if (termuxBusy) return;
        termuxBusy = true;
        if (btn) btn.classList.add('busy');
        console.log(TERMUX_LOG, '보낼 주소:', url, '| 형식:', format, '| 페이지:', location.href);
        try {
            // 1) Termux 서버 → 공유창 없이 바로 저장
            const res = await sendViaServer(url, format, meta);
            if (res.ok) {
                watchJobs(true);                                   // 진행 카드로 진행률 표시
                return;
            }

            // 실패 이유를 알려 주고, 공유창은 직접 누를 때만 (자동으로 띄우지 않음)
            try { GM_setClipboard(url, 'text'); } catch (e) { await copyText(url); }
            const msg = {
                perm: 'Tampermonkey가 Termux 연결을 막았어요. 설정에서 127.0.0.1 허용 필요',
                down: 'Termux 서버가 꺼져 있어요. Termux를 한 번 열어 주세요',
                timeout: 'Termux가 응답하지 않아요. Termux를 열어 깨워 주세요',
                http: `Termux 서버 오류 (${res.status} ${res.text || ''})`.trim()
            }[res.why] || 'Termux로 보내지 못했어요';
            console.log(TERMUX_LOG, '실패 이유:', res.why, res);
            if (navigator.share) {
                showSnack(msg + ' · 링크 복사됨', '공유', () => {
                    hideSnack();
                    navigator.share({ url }).catch((e) => console.warn(TERMUX_LOG, '공유 실패:', e && e.name));
                });
            } else {
                showSnack(msg + ' · 링크 복사됨');
            }
        } finally {
            termuxBusy = false;
            if (btn) btn.classList.remove('busy');
        }
    }

    // 다운 형식 고르기 → (MP4면) 데이터 주의 → 전송
    let dlScrim = null;
    let dlBox = null;
    function closeDl() {
        if (!dlBox) return;
        if (document.activeElement && dlBox.contains(document.activeElement)) document.activeElement.blur();
        dlBox.classList.remove('open');
        dlScrim.classList.remove('open');
    }

    // 다운 창 안 내용을 바꾸며 높이·내용을 스프링으로
    function swapDl(build) {
        const from = dlBox.offsetHeight;
        dlBox.textContent = '';
        build();
        const to = dlBox.offsetHeight;
        dlBox.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: 550, easing: SPRING.smooth });
        for (const [i, c] of [...dlBox.children].entries()) {
            c.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
                { duration: 550, delay: 40 * i, easing: SPRING.smooth, fill: 'backwards' });
        }
    }

    // 키보드가 올라오면 화면에 보이는 영역(visualViewport)이 줄어듦 → 그만큼 창을 부드럽게 올림
    // 입력칸을 누르는 순간 키보드가 올라올 걸 알기 때문에, 키보드를 기다리지 않고 바로 올림.
    // 높이는 지난번에 잰 키보드 높이(없으면 화면의 40%)로 먼저 움직이고, 실제 값이 오면 살짝 맞춤.
    const KB_KEY = 'uper_kb_height';
    let kbBound = false;
    let kbGuess = 0;
    let kbOpen = false;
    function setKb(px) {
        if (dlBox) dlBox.style.setProperty('--uper-kb', Math.max(0, Math.round(px)) + 'px');
    }
    function measuredKb() {
        const vv = window.visualViewport;
        return vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    }
    function syncKeyboard() {
        if (!dlBox) return;
        const kb = measuredKb();
        if (kb > 60) {
            kbGuess = kb;
            try { localStorage.setItem(KB_KEY, String(kb)); } catch (e) { /* 저장 못 해도 괜찮음 */ }
            setKb(kb);
        } else if (!kbOpen) {
            setKb(0);
        }
    }
    function guessKb() {
        if (!kbGuess) {
            try { kbGuess = +localStorage.getItem(KB_KEY) || 0; } catch (e) { kbGuess = 0; }
        }
        return kbGuess || Math.round(window.innerHeight * 0.4);
    }
    function bindKeyboard() {
        if (kbBound) return;
        kbBound = true;
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', syncKeyboard);
            window.visualViewport.addEventListener('scroll', syncKeyboard);
        }
        // 입력칸에 손가락이 닿는 순간 바로 올림
        document.addEventListener('touchstart', (e) => {
            if (!dlBox || !dlBox.classList.contains('open')) return;
            if (e.target.closest && e.target.closest('#uper-dl input')) {
                kbOpen = true;
                setKb(guessKb());
            }
        }, { capture: true, passive: true });
        document.addEventListener('focusin', (e) => {
            if (dlBox && dlBox.contains(e.target) && e.target.tagName === 'INPUT') {
                kbOpen = true;
                if (measuredKb() < 60) setKb(guessKb());
            }
        }, true);
        // 입력칸에서 나가면(다른 입력칸으로 옮기는 경우 제외) 바로 내림
        document.addEventListener('focusout', () => {
            setTimeout(() => {
                const a = document.activeElement;
                if (dlBox && a && dlBox.contains(a) && a.tagName === 'INPUT') return;
                kbOpen = false;
                setKb(0);
            }, 0);
        }, true);
    }

    function ensureDl() {
        bindKeyboard();
        if (dlBox) return;
        dlScrim = h('div', { id: 'uper-dl-scrim' });
        dlBox = h('div', { id: 'uper-dl', role: 'dialog', 'aria-label': '다운로드' });
        document.body.appendChild(dlScrim);
        document.body.appendChild(dlBox);
        bindTap(dlScrim, closeDl);
    }

    function openDl() {
        void dlBox.offsetWidth;
        dlScrim.classList.add('open');
        dlBox.classList.add('open');
    }

    // 제목·가수 입력칸 (삼성뮤직 등에서 m4a 태그 편집이 안 돼서, 저장할 때 직접 넣음)
    function metaForm(heading, meta, okText, onOk, onSkip) {
        const ti = h('input', { type: 'text', value: meta.title || '', placeholder: '제목', enterkeyhint: 'next' });
        const ar = h('input', { type: 'text', value: meta.artist || '', placeholder: '가수', enterkeyhint: 'done' });
        ti.value = meta.title || '';
        ar.value = meta.artist || '';
        const skip = h('button', { class: 'uper-btn-reset act', type: 'button', text: onSkip ? '그대로 받기' : '취소' });
        const ok = h('button', { class: 'uper-btn-reset act primary', type: 'button', text: okText });
        dlBox.append(
            h('h2', { text: heading }),
            h('label', {}, '제목', ti),
            h('label', {}, '가수', ar),
            h('div', { class: 'acts' }, skip, ok));
        bindTap(skip, () => (onSkip ? onSkip() : closeDl()));
        bindTap(ok, () => onOk({ title: ti.value.trim(), artist: ar.value.trim() }));
        ar.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
        ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') ar.focus(); });
    }

    // 지금 페이지의 영상 제목·채널 (다운 버튼용)
    function pageMeta() {
        const title = firstText(document, ['ytm-slim-video-metadata-section-renderer h2', '.slim-video-metadata-header h2',
            'ytm-video-description-header-renderer h2', 'h1.title', '#title h1', 'h1']) ||
            document.title.replace(/\s*-\s*YouTube\s*$/, '');
        const artist = firstText(document, ['ytm-slim-owner-renderer .slim-owner-channel-name', '.slim-owner-channel-name',
            'ytm-slim-owner-renderer h3', '#owner #channel-name a', 'ytd-video-owner-renderer #channel-name a']);
        return { title, artist };
    }

    // 기록에서 제목·가수 바꾸기
    function editTags(item) {
        ensureDl();
        dlBox.textContent = '';
        metaForm('제목·가수 바꾸기', { title: item.title, artist: item.artist }, '바꾸기', async (m) => {
            closeDl();
            const r = await serverGet('/retag?file=' + encodeURIComponent(item.file) +
                '&title=' + encodeURIComponent(m.title) + '&artist=' + encodeURIComponent(m.artist));
            if (r && r.status === 200) {
                showSnack('제목을 바꿨어요');
                if (sheet.classList.contains('settings')) renderSettings();
            } else {
                showSnack(r && r.data && r.data.error ? r.data.error : 'Termux 서버에 연결하지 못했어요');
            }
        });
        openDl();
    }

    function chooseDownload(url, btn, meta) {
        ensureDl();
        if (!dlBox) {
            dlScrim = h('div', { id: 'uper-dl-scrim' });
            dlBox = h('div', { id: 'uper-dl', role: 'dialog', 'aria-label': '다운로드' });
            document.body.appendChild(dlScrim);
            document.body.appendChild(dlBox);
            bindTap(dlScrim, closeDl);
        }
        const go = (format, m) => { closeDl(); sendToTermux(url, format, btn, m); };
        meta = meta || {};

        // 1단계: 형식
        const mp3 = h('button', { class: 'uper-btn-reset opt', type: 'button' },
            h('b', { text: 'M4A' }), h('span', { text: '음악만 · 변환 없이 빠름' }));
        const mp4 = h('button', { class: 'uper-btn-reset opt', type: 'button' },
            h('b', { text: 'MP4' }), h('span', { text: '영상 · 데이터 많이 사용' }));
        const cancel = h('button', { class: 'uper-btn-reset act', type: 'button', text: '취소' });
        dlBox.textContent = '';
        dlBox.append(h('h2', { text: '어떤 형식으로 받을까요?' }), h('div', { class: 'opts' }, mp3, mp4),
            h('div', { class: 'acts' }, cancel));
        bindTap(cancel, closeDl);
        // M4A: 제목·가수를 먼저 정하고 받음
        bindTap(mp3, () => swapDl(() => metaForm('곡 정보', meta, '받기',
            (m) => go('m4a', m), () => go('m4a'))));

        // 2단계: MP4는 데이터 주의 한 번 더
        bindTap(mp4, () => {
            const from = dlBox.offsetHeight;
            const back = h('button', { class: 'uper-btn-reset act', type: 'button', text: '취소' });
            const ok = h('button', { class: 'uper-btn-reset act primary', type: 'button', text: '받기' });
            dlBox.textContent = '';
            dlBox.append(
                h('h2', { text: '데이터 사용에 주의하세요' }),
                h('p', { text: '영상(MP4)은 음악보다 용량이 훨씬 커요. 와이파이가 아니면 모바일 데이터가 많이 쓰이고 요금이 나올 수 있어요.' }),
                h('div', { class: 'acts' }, back, ok));
            bindTap(back, closeDl);
            bindTap(ok, () => go('mp4'));
            const to = dlBox.offsetHeight;
            dlBox.animate([{ height: from + 'px' }, { height: to + 'px' }],
                { duration: 550, easing: SPRING.smooth });
            for (const [i, c] of [...dlBox.children].entries()) {
                c.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
                    { duration: 550, delay: 40 * i, easing: SPRING.smooth, fill: 'backwards' });
            }
        });

        void dlBox.offsetWidth;                  // 처음 만든 직후에도 등장 애니메이션이 보이도록
        dlScrim.classList.add('open');
        dlBox.classList.add('open');
    }

    function bindTermux() {
        // (1) 롱프레스 팝업에 '다운' 항목
        const popBtn = h('button', { class: 'uper-btn-reset termux-btn', type: 'button' }, icon('download', 20), '다운');
        popup.insertBefore(popBtn, tipBtn);
        bindTap(popBtn, () => {
            if (!pending) return;
            const url = cleanWatchUrl(pending.videoId);
            hidePopup();
            chooseDownload(url, null, { title: pending.title, artist: pending.channel });
        });

        // (2) 영상·쇼츠 페이지에서 유리통 왼쪽에 뜨는 버튼 → 지금 보는 영상
        const fab = h('button', {
            id: 'uper-termux', class: 'uper-btn-reset', type: 'button', 'aria-label': '다운로드'
        }, icon('download', 24));
        document.body.appendChild(fab);
        bindTap(fab, () => {
            const id = currentVideoId();          // 누르는 순간의 주소에서 읽음
            if (!id) {
                console.warn(TERMUX_LOG, '영상 ID를 찾지 못함:', location.href);
                showSnack('영상 페이지에서만 받을 수 있어요');
                return;
            }
            chooseDownload(cleanWatchUrl(id), fab, pageMeta());
        });

        progBox = h('div', { id: 'uper-dlprog' });
        document.body.appendChild(progBox);
        watchJobs(false);                         // 페이지를 열었을 때 이미 받는 중인 작업이 있으면 이어서 표시

        const sync = () => {
            fab.classList.toggle('on', !!currentVideoId());
            const jb = jar.style.bottom || '16px';
            if (fab.style.bottom !== jb) fab.style.bottom = jb;      // 유리통과 같은 높이
            const pb = (parseFloat(jb) + 60) + 'px';
            if (progBox.style.bottom !== pb) progBox.style.bottom = pb;
        };
        sync();
        setInterval(sync, 500);
        window.addEventListener('yt-navigate-finish', () => { closeDl(); sync(); });
        window.addEventListener('popstate', sync);
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
        bindTermux();
        bindPressTilt();
        bindSmoothNav();
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
