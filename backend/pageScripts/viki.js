// Injected into the Viki tab by Selenium. Installs window.__vk: a TV-style
// focus ring that moves spatially between tiles (D-pad), plus readers for
// the show page (episode ranges, episodes) and the player. Re-sent on every
// call and guarded by VERSION, so page reloads simply reinstall it.
(() => {
  const VERSION = 7;
  if (window.__vk && window.__vk.version === VERSION) return;

  const FOCUS_ATTR = 'data-vk-focus';
  const REL_ATTR = 'data-vk-rel';
  const CLICK_ATTR = 'data-vk-click';

  // Anything that opens a show, a movie, an episode or a person.
  const LINK_RE = /\/(tv|movies|videos|celebrities)\/\d+[a-z]{1,2}\b/i;
  const RANGE_RE = /^\s*\d+\s*-\s*\d+\s*$/;
  const EPISODE_RE = /^Ep\s*(\d+)/i;
  const PLAY_RE = /^(Play|Watch|Resume|Continue)\b/i;

  function injectStyle() {
    if (document.getElementById('vk-style')) return;
    const s = document.createElement('style');
    s.id = 'vk-style';
    // An overlay instead of an outline: card rows clip anything drawn outside.
    s.textContent = `
      [${REL_ATTR}] { position: relative !important; }
      [${FOCUS_ATTR}]::after {
        content: ''; position: absolute; inset: 0; z-index: 50; pointer-events: none;
        border: 4px solid #fff; border-radius: 10px;
        box-shadow: 0 0 0 3px rgba(31,140,255,.9), 0 0 24px rgba(31,140,255,.55);
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const path = () => location.pathname.replace(/\/+$/, '') || '/';

  // ------------------------------------------------------------------ player

  // The show's video (video.js's own element); during an ad break the ad
  // plays in a separate one (see adVideo).
  function video() {
    const tech = document.querySelector('video.vjs-tech');
    if (tech && (tech.currentSrc || tech.src)) return tech;
    let best = null;
    let area = 0;
    for (const v of document.querySelectorAll('video')) {
      if (!(v.currentSrc || v.src)) continue;
      const r = v.getBoundingClientRect();
      if (r.width * r.height > area) {
        area = r.width * r.height;
        best = v;
      }
    }
    return best;
  }

  function playerEl() {
    const v = video();
    if (!v) return null;
    return v.closest('.video-js, [class*="vjs-"], [id*="player" i], [class*="player" i]') || v.parentElement;
  }

  function loginWall() {
    return !!document.querySelector('[data-what="continue_with_google_button"], [data-what="continue_with_email_button"]');
  }

  function pageType() {
    const p = path();
    if (p.startsWith('/videos/')) {
      if (video()) return 'player';
      return loginWall() ? 'login' : 'loading';
    }
    if (p === '/') return 'home';
    if (/^\/(tv|movies)\/\d/.test(p)) return 'detail';
    if (p.startsWith('/search')) return 'search';
    if (p.startsWith('/watchlist')) return 'mylist';
    return 'browse';
  }

  // ------------------------------------------------------------------ page parts

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 14) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1;
  }

  // Carousel copies and slides parked off to the side don't count.
  function hiddenCopy(el) {
    if (el.closest('[aria-hidden="true"], .cloned, .carousel-item-hidden')) return true;
    const slide = el.closest('[data-testid="billboard"]');
    if (slide) {
      const r = slide.getBoundingClientRect();
      return r.left < -10 || r.left > innerWidth - 40;
    }
    return false;
  }

  // The range pills above the episode grid ("1-10", "11-20", ...).
  function ranges() {
    return [...document.querySelectorAll('main span, main button, span, button')]
      .filter((e) => e.children.length === 0 && RANGE_RE.test(e.textContent) && isVisible(e));
  }

  function rangeSelected(el) {
    const bg = getComputedStyle(el).backgroundColor;
    return !!bg && bg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(bg);
  }

  // Episode tiles, in order: the grid cell holding "Ep N" (free, locked or
  // coming soon alike).
  function episodes() {
    const cells = [];
    const seen = new Set();
    for (const t of document.querySelectorAll('[data-what="video_thumbnail"], .thumbnail')) {
      const cell = t.closest('[class*="col"]') || t;
      if (seen.has(cell)) continue;
      if (!EPISODE_RE.test(clean(cell.innerText))) continue;
      seen.add(cell);
      cells.push(cell);
    }
    return cells;
  }

  function episodeInfo(cell, index) {
    const lines = (cell.innerText || '').split('\n').map(clean).filter(Boolean);
    const num = (lines[0] || '').match(EPISODE_RE);
    const runtime = lines.find((l) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(l)) || '';
    const locked = !cell.querySelector('a[href*="/videos/"]');
    const note = lines.find((l) => /viki pass|available in|coming/i.test(l)) || (locked ? 'Locked' : '');
    return {
      index,
      title: num ? `Episode ${num[1]}` : lines[0] || `Episode ${index + 1}`,
      runtime,
      left: note,
      href: cell.querySelector('a[href*="/videos/"]')?.href || null,
    };
  }

  // The show/movie page's big play button: "Play Episode 1", "Watch", ...
  function playButton() {
    const els = [...document.querySelectorAll('main button, main a, button, a')];
    return els.find((b) => /^Play Episode/i.test(b.getAttribute('aria-label') || '') && isVisible(b)) ||
      els.find((b) => PLAY_RE.test(clean(b.getAttribute('aria-label') || b.innerText)) && isVisible(b) &&
        !b.closest('header, nav, footer')) ||
      null;
  }

  function cardLinks() {
    const out = [];
    for (const a of document.querySelectorAll('a[href]')) {
      if (!LINK_RE.test(a.getAttribute('href') || '')) continue;
      if (a.closest('header, nav, footer, [data-testid="search-popular-searches"]') || hiddenCopy(a)) continue;
      // The episode grid has its own entries; the billboard's title link
      // duplicates its image link.
      if (a.closest('[data-what="video_thumbnail"]')) continue;
      // A link stretched over its tile: the tile gets the ring.
      const tile = a.closest('[data-testid="content-row"]') ||
        (getComputedStyle(a).position === 'absolute' ? a.parentElement : a);
      out.push(tile);
    }
    return out;
  }

  function candidates() {
    const list = [];
    const type = pageType();
    if (type === 'detail') {
      const play = playButton();
      if (play) list.push(play);
      list.push(...document.querySelectorAll('[role="tab"]'));
      list.push(...ranges(), ...episodes());
    }
    if (type === 'search') {
      list.push(...document.querySelectorAll('[data-testid="search-page"] button[data-slot="text-button"]'));
    }
    for (const b of document.querySelectorAll('[data-testid="billboard-main-cta"] button, [data-testid="billboard-main-cta"] a')) {
      if (!hiddenCopy(b)) list.push(b);
    }
    list.push(...cardLinks());
    const seen = new Set();
    return list.filter((el) => {
      if (seen.has(el) || !isVisible(el)) return false;
      seen.add(el);
      return !el.closest('header, nav');
    });
  }

  // ------------------------------------------------------------------ focus ring

  function current() {
    const el = document.querySelector(`[${FOCUS_ATTR}]`);
    if (el && el.isConnected && isVisible(el) && !hiddenCopy(el)) return el;
    if (el) setFocus(null);
    return null;
  }

  function setFocus(el) {
    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((n) => {
      n.removeAttribute(FOCUS_ATTR);
      n.removeAttribute(REL_ATTR);
    });
    if (!el) return;
    el.setAttribute(FOCUS_ATTR, '');
    // The ring is drawn inside the element, which needs a positioned box;
    // never override one the page already positions.
    if (getComputedStyle(el).position === 'static') el.setAttribute(REL_ATTR, '');
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }

  function initialFocus(cands) {
    if (pageType() === 'detail') {
      const play = playButton();
      if (play && cands.includes(play)) return play;
    }
    const inView = cands
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom > 60 && r.top < innerHeight - 20 && r.left >= -5 && r.right <= innerWidth + 5);
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

  function cardTitle(el) {
    const a = el.matches('a') ? el : el.querySelector('a[aria-label]') || el.querySelector('a');
    const label = clean(a && a.getAttribute('aria-label')).replace(/^View\s+/i, '');
    return label ||
      clean(el.querySelector('[data-testid="content-row-fallback-image"]')?.textContent) ||
      clean(el.querySelector('img[alt]')?.getAttribute('alt')) ||
      clean((el.innerText || '').split('\n')[0]);
  }

  function describe(el) {
    if (!el) return null;
    const eps = episodes();
    const i = eps.indexOf(el);
    if (i >= 0) {
      const ep = episodeInfo(el, i);
      return { kind: 'episode', title: ep.title, sub: [ep.runtime, ep.left].filter(Boolean).join(' · ') };
    }
    if (RANGE_RE.test(el.textContent || '') && el.children.length === 0) {
      return { kind: 'tab', title: `Episodes ${clean(el.textContent)}` };
    }
    if (el.matches('[role="tab"], [data-slot="text-button"]')) return { kind: 'tab', title: clean(el.textContent) };
    if (el.matches('[data-testid="content-row"], a') || el.querySelector(':scope > a[href]')) return { kind: 'title', title: cardTitle(el).slice(0, 140) };
    return { kind: 'button', title: clean(el.getAttribute('aria-label') || el.innerText).slice(0, 80) };
  }

  function detailInfo() {
    if (pageType() !== 'detail') return null;
    const title = clean(document.querySelector('h1')?.textContent) ||
      document.title.replace(/\s*\|.*$/, '');
    const play = playButton();
    const playLabel = play ? clean(play.getAttribute('aria-label') || play.innerText) : null;
    return {
      title,
      playLabel,
      seasons: ranges().map((r) => ({ label: `Ep ${clean(r.textContent)}`, selected: rangeSelected(r) })),
      episodes: episodes().map(episodeInfo),
    };
  }

  function buttons(root) {
    return root ? [...root.querySelectorAll('button, [role="button"], a')] : [];
  }

  const label = (b) => clean(b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent);

  function playerButton(pattern) {
    return buttons(playerEl()).find((b) => pattern.test(label(b))) ||
      buttons(document.body).find((b) => pattern.test(label(b)) && isVisible(b) && !b.closest('header, nav, footer')) ||
      null;
  }

  // Skip Intro / Skip Recap / Skip Ad, whichever is on screen.
  function skipButton() {
    return buttons(document.body).find((b) => {
      const t = label(b);
      return /^skip/i.test(t) && !/seconds?$/i.test(t) && isVisible(b);
    }) || null;
  }

  function nextButton() {
    return playerButton(/^(Next episode|Play next|Up next|Next)\b/i);
  }

  // The next episode's link from the watch page's episode list.
  function nextEpisodeHref() {
    const id = (path().match(/\/videos\/(\d+v)/) || [])[1];
    if (!id) return null;
    const links = [...document.querySelectorAll('a[href*="/videos/"]')]
      .map((a) => a.href)
      .filter((h, i, all) => all.indexOf(h) === i && !/trailer|clip/i.test(h));
    const at = links.findIndex((h) => h.includes(`/videos/${id}`));
    return at >= 0 && links[at + 1] ? links[at + 1] : null;
  }

  // The open subtitle menu: a list that starts with "Off".
  function subtitleItems() {
    const list = [...document.querySelectorAll('ul')].find((ul) =>
      clean(ul.firstElementChild?.textContent) === 'Off' && isVisible(ul.firstElementChild));
    return list ? [...list.children] : [];
  }

  const langOf = (li) => clean(li.querySelector('span')?.textContent || li.textContent);

  // Viki's ads come from Google's IMA player: its overlay is on screen
  // while an ad break runs.
  function isAd() {
    const box = document.querySelector('.ima-ad-container');
    return !!box && getComputedStyle(box).display !== 'none' && box.getBoundingClientRect().height > 10;
  }

  // The ad that's playing (a short video of its own), or null.
  function adVideos() {
    if (!isAd()) return [];
    return [...document.querySelectorAll('video')].filter((v) =>
      (v.currentSrc || v.src) && !v.paused && isFinite(v.duration) && v.duration > 0 && v.duration <= 180);
  }

  // "AD • 0:34": the countdown IMA shows over the player.
  const adCountdown = () => clean(document.querySelector('.ima-countdown-div')?.textContent);

  let memo = null;

  function playerState() {
    const v = video();
    if (!v) return null;
    const skip = skipButton();
    const ad = isAd();
    const key = location.pathname;
    const raw = document.title.replace(/\s*\|\s*Rakuten Viki.*$/i, '');
    const parts = raw.split(/\s+-\s+(?=Episode\s+\d+)/i);
    if (!memo || memo.key !== key) memo = { key, hasNext: false };
    const hasNext = !!nextButton() || !!nextEpisodeHref();
    if (hasNext) memo.hasNext = true;
    return {
      title: clean(parts[0]) || raw,
      subtitle: clean(parts[1] || ''),
      currentTime: v.currentTime || 0,
      duration: isFinite(v.duration) ? v.duration : 0,
      paused: v.paused,
      volume: Math.round(v.volume * 100),
      muted: v.muted,
      skipLabel: ad ? 'Skip ad' : skip ? label(skip) : null,
      adLabel: ad ? adCountdown() || 'Ad' : null,
      hasNext: memo.hasNext,
      isAd: ad,
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

    // What to do with the focused element: a link to open, a range to show,
    // or an element marked for a trusted click.
    select() {
      injectStyle();
      const cur = current();
      if (!cur) {
        setFocus(initialFocus(candidates()));
        return { action: 'focused' };
      }
      const eps = episodes();
      const i = eps.indexOf(cur);
      if (i >= 0) {
        const ep = episodeInfo(cur, i);
        if (ep.href) return { action: 'open', href: ep.href, plays: true };
        return { action: 'click', ok: markForClick(cur.querySelector('a, .thumbnail') || cur) };
      }
      if (RANGE_RE.test(cur.textContent || '') && cur.children.length === 0) {
        cur.click();
        return { action: 'range' };
      }
      if (cur === playButton()) return { action: 'click', plays: true, ok: markForClick(cur) };
      const a = cur.matches('a[href]') ? cur : cur.querySelector('a[href]');
      if (a && LINK_RE.test(a.getAttribute('href') || '')) {
        return { action: 'open', href: a.href, plays: /\/videos\//.test(a.getAttribute('href')) };
      }
      return { action: 'click', ok: markForClick(cur) };
    },

    markPlay() { return markForClick(playButton()); },

    episode(i) {
      const cell = episodes()[i];
      if (!cell) return null;
      const ep = episodeInfo(cell, i);
      if (ep.href) return { href: ep.href };
      return { marked: markForClick(cell.querySelector('.thumbnail') || cell) };
    },

    range(i) {
      const r = ranges()[i];
      if (!r) return null;
      r.click();
      return clean(r.textContent);
    },

    markPlayerButton(source) {
      return markForClick(playerButton(new RegExp(source, 'i')));
    },

    markSkip() { return markForClick(skipButton()); },

    // Run the playing ad to its end; IMA then finishes the break and the
    // show carries on. True if there was an ad to skip.
    skipAd() {
      const ads = adVideos();
      ads.forEach((v) => { v.currentTime = Math.max(0, v.duration - 0.15); });
      return ads.length > 0;
    },

    subtitleMenuOpen() { return subtitleItems().length > 0; },

    // The subtitle track that's on ("Off" included), read from the menu
    // even while it's closed.
    subtitleOn() {
      const list = [...document.querySelectorAll('ul')].find((ul) => clean(ul.firstElementChild?.textContent) === 'Off');
      const on = list && [...list.children].find((li) => li.querySelector('[data-testid="check-icon"]'));
      return on ? langOf(on) : null;
    },

    // With the subtitle menu open. On -> Off. Off -> English, when there's
    // exactly one English track; otherwise nothing is clicked and the tracks
    // to choose from come back (every English one, or every track if none is
    // English). `pick` clicks that menu row instead.
    markSubtitle(pick) {
      const items = subtitleItems();
      if (!items.length) return null;
      if (pick !== null && pick !== undefined) {
        const row = items[pick];
        return row && markForClick(row) ? { picked: langOf(row) } : null;
      }
      const on = items.find((li) => li.querySelector('[data-testid="check-icon"]'));
      if (on && langOf(on) !== 'Off') return markForClick(items[0]) ? { picked: 'Off' } : null;
      const rows = items.map((li, index) => ({ index, label: clean(li.textContent), lang: langOf(li) })).slice(1);
      const english = rows.filter((r) => /^english\b/i.test(r.lang));
      if (english.length === 1) return markForClick(items[english[0].index]) ? { picked: english[0].lang } : null;
      return { choose: (english.length ? english : rows).map(({ index, label }) => ({ index, label })) };
    },

    // Next episode: the player's own button if it has one, else the next
    // link in the episode list.
    next() {
      const b = nextButton();
      if (b) return { marked: markForClick(b) };
      const href = nextEpisodeHref();
      return href ? { href } : null;
    },

    playPause() {
      const v = video();
      if (!v) return null;
      if (v.paused) v.play().catch(() => {});
      else v.pause();
      return !v.paused;
    },

    paused() {
      const v = video();
      return v ? v.paused : null;
    },

    seek(delta) {
      const v = video();
      if (!v || isAd()) return null;
      const end = isFinite(v.duration) ? v.duration - 1 : v.currentTime + delta;
      v.currentTime = clamp(v.currentTime + delta, 0, end);
      return Math.round(v.currentTime);
    },

    mute() {
      const v = video();
      if (!v) return null;
      v.muted = !v.muted;
      return v.muted;
    },

    volume(delta) {
      const v = video();
      if (!v) return null;
      v.muted = false;
      v.volume = clamp(v.volume + delta / 100, 0, 1);
      return Math.round(v.volume * 100);
    },

    // Point to aim the mouse at so the player shows its controls.
    playerBox() {
      const p = playerEl();
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },

    clearFocus() { setFocus(null); },
  };

  window.__vk = api;
  injectStyle();
})();
