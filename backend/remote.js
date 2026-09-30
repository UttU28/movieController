// Injected into the YouTube tab by Selenium. Installs window.__ytr, a tiny
// "TV remote" layer: a focus ring that moves spatially between tiles
// (D-pad), plus helpers to read/drive the player. Re-sent on every call and
// guarded by VERSION, so full page reloads simply reinstall it.
(() => {
  const VERSION = 13;
  if (window.__ytr && window.__ytr.version === VERSION) return;

  const FOCUS_ATTR = 'data-ytr-focus';

  // Tiles the focus ring can land on. Nested matches (e.g. a lockup inside a
  // rich-item) are collapsed to the outermost one.
  const ITEM_SEL = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'ytd-channel-renderer',
    'ytd-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-reel-item-renderer',
    'yt-lockup-view-model',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-watch-card-hero-video-renderer',
    'ytd-watch-card-compact-video-renderer',
  ].join(',');
  // Sponsored tiles are skipped entirely.
  const AD_SEL = 'ytd-ad-slot-renderer, ytd-search-pyv-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer';
  const isAd = (el) => !!(el.closest(AD_SEL) || el.querySelector(AD_SEL + ', a[href*="googleadservices.com"]'));
  const CHIP_SEL = 'yt-chip-cloud-chip-renderer, yt-tab-shape';
  const ALL_SEL = ITEM_SEL + ',' + CHIP_SEL;

  const SKIP_AD_SEL = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    'button[id^="skip-button"]',
  ].join(',');

  function injectStyle() {
    if (document.getElementById('ytr-style')) return;
    const s = document.createElement('style');
    s.id = 'ytr-style';
    s.textContent = `
      [${FOCUS_ATTR}] {
        outline: 4px solid #3ea6ff !important;
        outline-offset: 3px !important;
        border-radius: 14px !important;
        box-shadow: 0 0 0 10px rgba(62,166,255,.28) !important;
        transition: outline-color .1s, box-shadow .1s;
      }
      #movie_player[${FOCUS_ATTR}] { outline-offset: -4px !important; border-radius: 0 !important; box-shadow: none !important; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function pageType() {
    const p = location.pathname;
    if (p === '/' || p === '') return 'home';
    if (p.startsWith('/results')) return 'search';
    if (p.startsWith('/watch')) return 'watch';
    if (p.startsWith('/shorts')) return 'shorts';
    if (p.startsWith('/playlist')) return 'playlist';
    if (p.startsWith('/feed')) return 'feed';
    if (p.startsWith('/@') || p.startsWith('/channel') || p.startsWith('/c/') || p.startsWith('/user')) return 'channel';
    return 'other';
  }

  // Pages can hold several players (hidden home/channel previews, the shorts
  // player). Use the visible one, preferring whichever is actually playing.
  function player() {
    const all = [...document.querySelectorAll('.html5-video-player')].filter((p) => {
      // Muted hover previews on tiles aren't "the" player.
      if (p.id === 'inline-preview-player' || p.closest('#video-preview-container, ytd-video-preview')) return false;
      const r = p.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const playing = all.find((p) => {
      const v = p.querySelector('video');
      return v && !v.paused;
    });
    return playing || all[0] || document.querySelector('#movie_player');
  }
  const video = () => {
    const p = player();
    return (p && p.querySelector('video')) || document.querySelector('video');
  };

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 16) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  // Sticky/fixed headers (home chip bar) are treated as sitting at the top of
  // the document; otherwise their doc-y follows the scroll and "up" from any
  // row would jump into them.
  function isPinned(el) {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
    }
    return false;
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    const pinned = el.matches(CHIP_SEL) && isPinned(el);
    return { x: r.left + scrollX, y: r.top + (pinned ? 0 : scrollY), w: r.width, h: r.height };
  }

  function candidates() {
    const list = [...document.querySelectorAll(ALL_SEL)].filter((el) => {
      const parent = el.parentElement && el.parentElement.closest(ALL_SEL);
      return !parent && !el.closest('#guide, ytd-miniplayer, tp-yt-app-drawer') && isVisible(el) && !isAd(el);
    });
    if (pageType() === 'watch') {
      const p = player();
      if (p && isVisible(p)) list.unshift(p);
    }
    return list;
  }

  function current() {
    const el = document.querySelector(`[${FOCUS_ATTR}]`);
    if (!el) return null;
    // Stale focus (element hidden after SPA navigation) is dropped.
    if (!el.isConnected || !isVisible(el) || !(el.matches(ALL_SEL) || el.id === 'movie_player')) {
      el.removeAttribute(FOCUS_ATTR);
      return null;
    }
    return el;
  }

  function scrollTo(el) {
    if (el.id === 'movie_player') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (el.matches(CHIP_SEL) && isPinned(el)) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } else {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }

  function setFocus(el) {
    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((n) => n.removeAttribute(FOCUS_ATTR));
    if (!el) return;
    el.setAttribute(FOCUS_ATTR, '');
    scrollTo(el);
  }

  // First tile in the viewport (top-left first); on watch pages the player.
  function initialFocus(cands) {
    if (pageType() === 'watch') {
      const p = cands.find((c) => c.id === 'movie_player');
      if (p) return p;
    }
    const inView = cands
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom > 60 && r.top < innerHeight - 20)
      .filter(({ el }) => !el.matches(CHIP_SEL));
    inView.sort((a, b) => (Math.abs(a.r.top - b.r.top) > 20 ? a.r.top - b.r.top : a.r.left - b.r.left));
    return (inView[0] || { el: cands.find((c) => !c.matches(CHIP_SEL)) || cands[0] }).el || null;
  }

  function bestInDirection(cur, cands, dir) {
    const c = rectOf(cur);
    let best = null;
    let bestScore = Infinity;
    for (const el of cands) {
      if (el === cur) continue;
      const r = rectOf(el);
      const tol = Math.min(c.w, c.h, r.w, r.h) * 0.3;
      let primary, gap, centerDiff;
      if (dir === 'down' || dir === 'up') {
        primary = dir === 'down' ? r.y - (c.y + c.h) : c.y - (r.y + r.h);
        gap = Math.max(0, Math.max(r.x, c.x) - Math.min(r.x + r.w, c.x + c.w));
        centerDiff = Math.abs(r.x + r.w / 2 - (c.x + c.w / 2));
      } else {
        primary = dir === 'right' ? r.x - (c.x + c.w) : c.x - (r.x + r.w);
        gap = Math.max(0, Math.max(r.y, c.y) - Math.min(r.y + r.h, c.y + c.h));
        centerDiff = Math.abs(r.y + r.h / 2 - (c.y + c.h / 2));
      }
      if (primary < -tol) continue;
      const score = Math.max(0, primary) + gap * 3 + centerDiff * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function textOf(el, sels) {
    for (const s of sels) {
      const n = el.querySelector(s);
      const t = n && (n.getAttribute('title') || n.textContent || '').trim();
      if (t) return t.replace(/\s+/g, ' ');
    }
    return '';
  }

  function linkOf(el) {
    return (
      el.querySelector('a#thumbnail[href]') ||
      el.querySelector('a[class*="LockupViewModelContentImage"][href]') ||
      el.querySelector('a[href*="/watch"]') ||
      el.querySelector('a[href*="/shorts/"]') ||
      el.querySelector('a#main-link[href]') ||
      el.querySelector('a[href]')
    );
  }

  function describe(el) {
    if (!el) return null;
    if (el.id === 'movie_player') return { kind: 'player', title: 'Video player' };
    if (el.matches(CHIP_SEL)) {
      return { kind: el.matches('yt-tab-shape') ? 'tab' : 'chip', title: (el.textContent || '').trim().replace(/\s+/g, ' ') };
    }
    const a = linkOf(el);
    const href = a ? a.getAttribute('href') || '' : '';
    let kind = 'video';
    if (href.includes('/shorts/')) kind = 'short';
    else if (href.startsWith('/@') || href.startsWith('/channel')) kind = 'channel';
    else if (href.includes('list=') && !href.includes('v=')) kind = 'playlist';
    const title =
      textOf(el, [
        '#video-title',
        'a#video-title-link',
        '.yt-lockup-metadata-view-model__title',
        '.ytLockupMetadataViewModelTitle',
        '.shortsLockupViewModelHostMetadataTitle',
        'h3[title]',
        'h3',
        '#watch-card-title',
        '#channel-title',
        '#title',
        '.title',
      ]) ||
      (el.getAttribute('aria-label') || '').trim() ||
      // Last resort: the longest text line (skips duration/badge overlays).
      (el.innerText || '').split(/\n/).map((t) => t.trim()).sort((a, b) => b.length - a.length)[0] ||
      '';
    const channel = textOf(el, ['#watch-card-subtitle', 'ytd-channel-name #text', '#channel-name #text', '.yt-content-metadata-view-model__metadata-text', '[class*="ContentMetadataViewModelMetadataText"]']);
    return { kind, title: title.slice(0, 140), channel: channel.slice(0, 80) };
  }

  function playerState() {
    const v = video();
    const p = player();
    const pt = pageType();
    // The miniplayer keeps playing over other pages (home, search, ...).
    const mini = !!(p && p.closest('ytd-miniplayer, ytd-miniplayer-player-container') && p.getBoundingClientRect().width > 0);
    if (!v || (pt !== 'watch' && pt !== 'shorts' && !mini)) return null;
    let data = {};
    try { data = (p && p.getVideoData && p.getVideoData()) || {}; } catch (e) {}
    let volume = Math.round(v.volume * 100);
    let muted = v.muted;
    try {
      if (p && p.getVolume) { volume = p.getVolume(); muted = p.isMuted(); }
    } catch (e) {}
    const skip = document.querySelector(SKIP_AD_SEL);
    return {
      title: data.title || document.title.replace(/ - YouTube$/, ''),
      channel: data.author || '',
      currentTime: v.currentTime || 0,
      duration: isFinite(v.duration) ? v.duration : 0,
      paused: v.paused,
      volume,
      muted,
      rate: v.playbackRate,
      isAd: !!(p && p.classList.contains('ad-showing')),
      canSkipAd: !!(skip && isVisible(skip)),
    };
  }

  // The first results on a search page, for the phone's result list.
  const MAX_RESULTS = 10;

  function searchResultTiles() {
    const root = document.querySelector('ytd-search #primary, ytd-search') || document;
    return [...root.querySelectorAll(ITEM_SEL)].filter((el) => {
      const parent = el.parentElement && el.parentElement.closest(ITEM_SEL);
      if (parent || isAd(el) || el.closest('#secondary')) return false;
      const a = linkOf(el);
      const href = a ? a.getAttribute('href') || '' : '';
      return /\/watch\?|\/shorts\/|[?&]list=/.test(href);
    }).slice(0, MAX_RESULTS);
  }

  function searchResults() {
    if (pageType() !== 'search') return null;
    return searchResultTiles().map((el, index) => {
      const info = describe(el);
      const href = linkOf(el).href;
      // The time badge on the thumbnail ("12:34" / "1:02:03").
      const badge = [...el.querySelectorAll('[class*="BadgeShapeText"], ytd-thumbnail-overlay-time-status-renderer span, badge-shape div')]
        .find((n) => /^\d+(:\d\d)+$/.test((n.textContent || '').trim()));
      const duration = badge ? badge.textContent.trim() : '';
      const live = /^live$/i.test(duration) || !!el.querySelector('[class*="Live"], .badge-style-type-live-now');
      return {
        index,
        kind: /[?&]list=RD/.test(href) ? 'mix' : info.kind,
        title: info.title,
        channel: info.channel,
        duration: /\d:\d/.test(duration) ? duration : live ? 'LIVE' : '',
        href,
      };
    });
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  const api = {
    version: VERSION,

    state() {
      return {
        pageType: pageType(),
        url: location.href,
        title: document.title,
        fullscreen: !!document.fullscreenElement,
        focus: describe(current()),
        player: playerState(),
        results: searchResults(),
      };
    },

    resultHref(i) {
      const r = searchResults();
      return r && r[i] ? r[i].href : null;
    },

    // Returns {moved, edge}. 'edge' = nothing further that way; on "down"
    // we nudge the page so YouTube lazy-loads more tiles for a retry.
    move(dir) {
      injectStyle();
      const cands = candidates();
      const cur = current();
      if (!cur) {
        setFocus(initialFocus(cands));
        return { moved: true, edge: false };
      }
      const next = bestInDirection(cur, cands, dir);
      if (next) {
        setFocus(next);
        return { moved: true, edge: false };
      }
      if (dir === 'down') window.scrollBy({ top: innerHeight * 0.8, behavior: 'smooth' });
      if (dir === 'up') window.scrollTo({ top: 0, behavior: 'smooth' });
      return { moved: false, edge: true };
    },

    // Activates the focused tile. Returns the href (if any) so the caller can
    // fall back to a hard navigation when YouTube ignores the synthetic click.
    select() {
      injectStyle();
      const cur = current();
      if (!cur) {
        setFocus(initialFocus(candidates()));
        return { action: 'focused' };
      }
      if (cur.id === 'movie_player') {
        api.playPause();
        return { action: 'playPause' };
      }
      const target = cur.matches(CHIP_SEL)
        ? cur.querySelector('button, a, #chip-container') || cur
        : linkOf(cur) || cur;
      const href = target.href || null;
      cur.removeAttribute(FOCUS_ATTR);
      target.click();
      return { action: 'click', href };
    },

    clearFocus() { setFocus(null); },

    playPause() {
      const v = video();
      if (!v) return false;
      if (v.paused) v.play(); else v.pause();
      return true;
    },

    seek(delta) {
      const v = video();
      if (!v) return false;
      v.currentTime = clamp(v.currentTime + delta, 0, isFinite(v.duration) ? v.duration - 0.5 : 1e9);
      return true;
    },

    volume(delta) {
      const p = player();
      const v = video();
      try {
        if (p && p.setVolume) {
          if (delta > 0 && p.isMuted()) p.unMute();
          p.setVolume(clamp(p.getVolume() + delta, 0, 100));
          return true;
        }
      } catch (e) {}
      if (!v) return false;
      v.muted = false;
      v.volume = clamp(v.volume + delta / 100, 0, 1);
      return true;
    },

    toggleMute() {
      const p = player();
      try {
        if (p && p.isMuted) { p.isMuted() ? p.unMute() : p.mute(); return true; }
      } catch (e) {}
      const v = video();
      if (v) v.muted = !v.muted;
      return !!v;
    },

    cycleSpeed() {
      const v = video();
      if (!v) return null;
      const speeds = [1, 1.25, 1.5, 1.75, 2, 0.75];
      const i = speeds.indexOf(v.playbackRate);
      const rate = speeds[(i + 1) % speeds.length];
      const p = player();
      try { if (p && p.setPlaybackRate) p.setPlaybackRate(rate); else v.playbackRate = rate; }
      catch (e) { v.playbackRate = rate; }
      return rate;
    },

    clickNext() {
      const b = document.querySelector('.ytp-next-button');
      if (b && isVisible(b) && b.getAttribute('aria-disabled') !== 'true') { b.click(); return true; }
      return false;
    },

    skipAd() {
      const b = document.querySelector(SKIP_AD_SEL);
      if (b) { b.click(); return true; }
      return false;
    },

    goHome() {
      const logo = document.querySelector('ytd-masthead a#logo, a#logo');
      if (logo) { logo.click(); return true; }
      return false;
    },

    activePlayer() { return player(); },

    blur() {
      const a = document.activeElement;
      if (a && a !== document.body && ['INPUT', 'TEXTAREA'].includes(a.tagName)) a.blur();
    },
  };

  window.__ytr = api;
  injectStyle();
})();
