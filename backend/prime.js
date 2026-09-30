// Injected into the Prime Video tab by Selenium. Installs window.__prv: a
// TV-style focus ring that moves spatially between tiles (D-pad), plus
// readers for the detail page (seasons, episodes) and the player. Re-sent on
// every call and guarded by VERSION, so page reloads simply reinstall it.
(() => {
  const VERSION = 4;
  if (window.__prv && window.__prv.version === VERSION) return;

  const FOCUS_ATTR = 'data-prv-focus';
  const CLICK_ATTR = 'data-prv-click';

  const CARD_SEL = [
    'article[data-testid="card"]',
    'article[data-testid="super-carousel-card"]',
    'article[data-testid="top-hero-card"]',
  ].join(',');
  const EPISODE_SEL = 'li[data-testid="episode-list-item"]';
  const TAB_SEL = 'button[data-testid^="btf-"][data-testid$="-tab"]';
  const PLAY_SEL = '[data-testid="dp-atf-play-button"]';

  function injectStyle() {
    if (document.getElementById('prv-style')) return;
    const s = document.createElement('style');
    s.id = 'prv-style';
    // An overlay instead of an outline: card rows clip anything drawn outside.
    s.textContent = `
      [${FOCUS_ATTR}] { position: relative !important; }
      [${FOCUS_ATTR}]::after {
        content: ''; position: absolute; inset: 0; z-index: 50; pointer-events: none;
        border: 4px solid #fff; border-radius: 10px;
        box-shadow: 0 0 0 3px rgba(0,168,225,.9), 0 0 24px rgba(0,168,225,.55);
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ------------------------------------------------------------------ pages

  const regionPrefix = () => (location.pathname.match(/^\/region\/[a-z]+/i) || [''])[0];

  function playerEl() {
    const p = document.querySelector('#dv-web-player');
    if (!p) return null;
    const r = p.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(p).visibility !== 'hidden' ? p : null;
  }

  function video() {
    const p = playerEl();
    if (!p) return null;
    return [...p.querySelectorAll('video')].find((v) => v.currentSrc || v.src) || null;
  }

  function pageType() {
    if (playerEl() && video()) return 'player';
    const path = location.pathname.replace(/^\/region\/[a-z]+/i, '');
    if (path.startsWith('/detail')) return 'detail';
    if (path.startsWith('/search')) return 'search';
    if (path === '' || path === '/' || path.startsWith('/storefront')) return 'home';
    if (path.startsWith('/mystuff')) return 'mystuff';
    return 'browse';
  }

  // ------------------------------------------------------------------ focus ring

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 16) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1;
  }

  // The hero banner stacks all its slides on top of each other; only the one
  // actually painted on top counts.
  function heroOnTop(el) {
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
    if (r.bottom < 0 || r.top > innerHeight) return true; // scrolled away: keep one
    const hit = document.elementFromPoint(x, y);
    return !!(hit && el.contains(hit));
  }

  function detailButtons() {
    const out = [];
    const play = document.querySelector(PLAY_SEL);
    if (play) out.push(play);
    for (const el of document.querySelectorAll('main a, main button')) {
      const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (/^(Watch trailer|Add (Season )?to Watchlist|Remove from Watchlist|Resume|Play|Rent|Buy)/i.test(label) &&
          el.getBoundingClientRect().top + scrollY < 900) out.push(el);
    }
    return out;
  }

  function candidates() {
    const list = [];
    if (pageType() === 'detail') list.push(...detailButtons());
    list.push(...document.querySelectorAll(EPISODE_SEL), ...document.querySelectorAll(TAB_SEL));
    for (const el of document.querySelectorAll(CARD_SEL)) {
      if (el.getAttribute('data-testid') === 'top-hero-card' && !heroOnTop(el)) continue;
      list.push(el);
    }
    const seen = new Set();
    return list.filter((el) => {
      if (seen.has(el) || !isVisible(el)) return false;
      seen.add(el);
      return !el.closest('header, nav, [data-testid^="pv-nav"]');
    });
  }

  function current() {
    const el = document.querySelector(`[${FOCUS_ATTR}]`);
    if (el && el.isConnected && isVisible(el)) return el;
    if (el) el.removeAttribute(FOCUS_ATTR);
    return null;
  }

  function setFocus(el) {
    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((n) => n.removeAttribute(FOCUS_ATTR));
    if (!el) return;
    el.setAttribute(FOCUS_ATTR, '');
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }

  function initialFocus(cands) {
    if (pageType() === 'detail') {
      const play = cands.find((c) => c.matches(PLAY_SEL));
      if (play) return play;
    }
    const inView = cands
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom > 80 && r.top < innerHeight - 20 && r.left >= -5 && r.right <= innerWidth + 5);
    inView.sort((a, b) => (Math.abs(a.r.top - b.r.top) > 20 ? a.r.top - b.r.top : a.r.left - b.r.left));
    return (inView[0] && inView[0].el) || cands[0] || null;
  }

  function bestInDirection(cur, cands, dir) {
    const c = rectOf(cur);
    let best = null;
    let bestScore = Infinity;
    for (const el of cands) {
      if (el === cur || el.contains(cur) || cur.contains(el)) continue;
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

  // ------------------------------------------------------------------ readers

  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

  function episodeInfo(li, index) {
    const lines = (li.querySelector('[data-testid="episode-image"]')?.innerText || '')
      .split('\n').map(clean).filter(Boolean);
    const title = lines.find((l) => /^\d+\.\s/.test(l)) || lines[lines.length - 1] || `Episode ${index + 1}`;
    const left = lines.find((l) => /left$/i.test(l)) || '';
    const runtime = clean(li.querySelector('[data-testid="episode-runtime"]')?.textContent);
    return { index, title, left, runtime };
  }

  // Cards keep their title in different places depending on the row type.
  function cardTitle(el) {
    const withTitle = el.matches('[data-card-title]') ? el : el.querySelector('[data-card-title]');
    const candidates = [
      withTitle && withTitle.getAttribute('data-card-title'),
      el.querySelector('h2, h3')?.textContent,
      el.querySelector('a[aria-label], button[aria-label]')?.getAttribute('aria-label'),
      ...[...el.querySelectorAll('img[alt]')].map((img) => img.getAttribute('alt')),
      (el.innerText || '').split(/\n/)[0],
    ];
    return clean(candidates.find((t) => clean(t)) || '');
  }

  function describe(el) {
    if (!el) return null;
    if (el.matches(EPISODE_SEL)) {
      const i = [...document.querySelectorAll(EPISODE_SEL)].indexOf(el);
      const ep = episodeInfo(el, i);
      return { kind: 'episode', title: ep.title, sub: [ep.runtime, ep.left].filter(Boolean).join(' · ') };
    }
    if (el.matches(TAB_SEL)) return { kind: 'tab', title: clean(el.textContent) };
    if (el.matches(CARD_SEL)) {
      return { kind: 'title', title: cardTitle(el).slice(0, 140) };
    }
    return { kind: 'button', title: clean(el.getAttribute('aria-label') || el.innerText).slice(0, 80) };
  }

  function detailInfo() {
    if (pageType() !== 'detail') return null;
    const title = clean(document.querySelector('h1 img')?.getAttribute('alt')) ||
      clean(document.querySelector('h1')?.textContent) ||
      document.title.replace(/^Prime Video:\s*/i, '');
    const seasons = [...document.querySelectorAll('[data-testid="dp-season-selector"] li a')].map((a) => ({
      label: clean(a.textContent),
      href: a.href,
    }));
    const selectedLabel = (document.querySelector('[data-testid="dp-season-selector"] input')?.getAttribute('aria-label') || '')
      .match(/Season \d+/i);
    const selected = selectedLabel ? selectedLabel[0] : (seasons[0] && seasons[0].label) || '';
    const play = document.querySelector(PLAY_SEL);
    return {
      title,
      playLabel: clean(play?.innerText) || null,
      seasons: seasons.map((s) => ({ ...s, selected: s.label.toLowerCase() === selected.toLowerCase() })),
      episodes: [...document.querySelectorAll(EPISODE_SEL)].map(episodeInfo),
    };
  }

  function playerButton(pattern) {
    const p = playerEl();
    if (!p) return null;
    return [...p.querySelectorAll('button, [role="button"]')].find((b) =>
      pattern.test(clean(b.getAttribute('aria-label') || b.textContent))) || null;
  }

  // Intro / recap / ad skip buttons (not the ±10 s seek buttons).
  function skipButton() {
    const p = playerEl();
    if (!p) return null;
    return [...p.querySelectorAll('button, [role="button"]')].find((b) => {
      const t = clean(b.getAttribute('aria-label') || b.textContent);
      return /^skip/i.test(t) && !/seconds?$/i.test(t) && isVisible(b);
    }) || null;
  }

  let memo = null;

  function playerState() {
    const v = video();
    if (!v) return null;
    const p = playerEl();
    const text = (sel) => clean(p.querySelector(sel)?.textContent);
    const skip = skipButton();
    // Prime removes the title bar and buttons while its controls are hidden,
    // so remember what they said last time they were on screen.
    const key = location.href + '|' + Math.round(v.duration || 0);
    const seen = {
      title: text('.atvwebplayersdk-title-text'),
      subtitle: text('.atvwebplayersdk-subtitle-text') || text('.atvwebplayersdk-episode-info'),
      hasNext: !!playerButton(/^Next Episode/i) || !!p.querySelector('.atvwebplayersdk-nextupcard-button'),
    };
    if (!memo || memo.key !== key) memo = { key, title: '', subtitle: '', hasNext: false };
    if (seen.title) Object.assign(memo, seen);
    return {
      title: memo.title || document.title.replace(/^Prime Video:\s*/i, ''),
      subtitle: memo.subtitle,
      currentTime: v.currentTime || 0,
      duration: isFinite(v.duration) ? v.duration : 0,
      paused: v.paused,
      volume: Math.round(v.volume * 100),
      muted: v.muted,
      skipLabel: skip ? clean(skip.getAttribute('aria-label') || skip.textContent) : null,
      hasNext: memo.hasNext || seen.hasNext,
      isAd: !!p.querySelector('.atvwebplayersdk-ad-timer, [class*="adtimeindicator"]'),
      fullscreen: !!document.fullscreenElement,
    };
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // Mark an element for Selenium to click with a real (trusted) mouse click.
  function markForClick(el) {
    document.querySelectorAll(`[${CLICK_ATTR}]`).forEach((n) => n.removeAttribute(CLICK_ATTR));
    if (!el) return false;
    el.setAttribute(CLICK_ATTR, '');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    return true;
  }

  const api = {
    version: VERSION,

    state() {
      return {
        pageType: pageType(),
        url: location.href,
        region: regionPrefix(),
        title: document.title,
        focus: describe(current()),
        detail: detailInfo(),
        player: playerState(),
      };
    },

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

    // Returns what to do with the focused element: a link to open, or an
    // element marked for a trusted click.
    select() {
      injectStyle();
      const cur = current();
      if (!cur) {
        setFocus(initialFocus(candidates()));
        return { action: 'focused' };
      }
      if (cur.matches(EPISODE_SEL)) {
        return { action: 'click', plays: true, ok: markForClick(cur.querySelector('a[data-testid="episodes-playbutton"]') || cur) };
      }
      if (cur.matches(PLAY_SEL)) return { action: 'click', plays: true, ok: markForClick(cur) };
      if (cur.matches(CARD_SEL)) {
        const a = cur.querySelector('a[href*="/detail/"]') || cur.querySelector('a[href]');
        if (a && a.href) return { action: 'open', href: a.href };
      }
      return { action: 'click', ok: markForClick(cur) };
    },

    markPlay() { return markForClick(document.querySelector(PLAY_SEL)); },

    markEpisode(i) {
      const li = document.querySelectorAll(EPISODE_SEL)[i];
      return markForClick(li && (li.querySelector('a[data-testid="episodes-playbutton"]') || li));
    },

    markPlayerButton(source) {
      return markForClick(playerButton(new RegExp(source, 'i')));
    },

    markSkip() { return markForClick(skipButton()); },

    markNextUp() {
      const p = playerEl();
      return markForClick(playerButton(/^Next Episode/i) || (p && p.querySelector('.atvwebplayersdk-nextupcard-button')));
    },

    volume(delta) {
      const v = video();
      if (!v) return null;
      v.muted = false;
      v.volume = clamp(v.volume + delta / 100, 0, 1);
      return Math.round(v.volume * 100);
    },

    clearFocus() { setFocus(null); },
  };

  window.__prv = api;
  injectStyle();
})();
