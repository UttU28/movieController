// Injected into the Netflix tab by Selenium. Installs window.__nfr: a TV-style
// focus ring for the profile picker, browse rows and the title pop-up, plus
// readers for seasons, episodes and the player. Re-sent on every call and
// guarded by VERSION, so page reloads simply reinstall it.
(() => {
  const VERSION = 6;
  if (window.__nfr && window.__nfr.version === VERSION) return;

  const FOCUS_ATTR = 'data-nfr-focus';
  const CLICK_ATTR = 'data-nfr-click';

  const CARD_SEL = 'a[data-uia="standard-card"], a[data-uia="progress-card"], a[data-uia="top-10-card"]';
  const PROFILE_SEL = 'button[data-uia^="profile-selector+tile"]';
  const EPISODE_SEL = '.episode-item[role="button"]';
  const MODAL_SEL = '.previewModal--container.detail-modal';
  const ROW_SEL = 'section[data-uia^="carousel-row-section"]';

  function injectStyle() {
    if (document.getElementById('nfr-style')) return;
    const s = document.createElement('style');
    s.id = 'nfr-style';
    // An overlay instead of an outline: rows clip anything drawn outside.
    s.textContent = `
      [${FOCUS_ATTR}] { position: relative !important; }
      [${FOCUS_ATTR}]::after {
        content: ''; position: absolute; inset: 0; z-index: 50; pointer-events: none;
        border: 4px solid #fff; border-radius: 6px;
        box-shadow: 0 0 0 3px rgba(229,9,20,.9), 0 0 22px rgba(229,9,20,.6);
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------------ pages

  const modal = () => document.querySelector(MODAL_SEL);
  const video = () => document.querySelector('[data-uia="player"] video, .watch-video video') || null;

  function pageType() {
    const p = location.pathname;
    if (p.startsWith('/watch')) return 'player';
    if (document.querySelector('[data-uia="profile-gate-screen"], [data-uia="profile-selector"]') &&
        document.querySelector(PROFILE_SEL)) return 'profiles';
    if (modal()) return 'detail';
    if (p.startsWith('/search')) return 'search';
    if (p === '/browse' || p === '/' ) return 'home';
    if (p.startsWith('/browse/my-list')) return 'mylist';
    return 'browse';
  }

  // ------------------------------------------------------------------ focus ring

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 16) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1;
  }

  // Rows slide sideways with a transform; only cards actually on screen count
  // (the D-pad pages the row when you step past its edge).
  function onScreenX(el) {
    const r = el.getBoundingClientRect();
    return r.left >= -8 && r.right <= innerWidth + 8;
  }

  function candidates() {
    const type = pageType();
    let list;
    if (type === 'profiles') {
      list = [...document.querySelectorAll(PROFILE_SEL)];
    } else if (type === 'detail') {
      const m = modal();
      list = [
        ...m.querySelectorAll('a[data-uia="play-button"], button[data-uia="play-button"]'),
        ...m.querySelectorAll('.previewModal--detailsMetadata ~ * button[data-uia="add-to-my-list"], [data-uia="mini-modal-controls"] button[data-uia="add-to-my-list"]'),
        ...m.querySelectorAll(EPISODE_SEL),
        ...m.querySelectorAll('.titleCard--container:not(.episode-item)'),
      ];
    } else {
      list = [
        ...document.querySelectorAll('.billboard a[data-uia="play-button"], .billboard button[data-uia="play-button"], [data-uia="billboard-more-info"]'),
        ...[...document.querySelectorAll(CARD_SEL)].filter(onScreenX),
      ];
    }
    const seen = new Set();
    return list.filter((el) => {
      if (seen.has(el) || !isVisible(el)) return false;
      seen.add(el);
      return true;
    });
  }

  function current() {
    const el = document.querySelector(`[${FOCUS_ATTR}]`);
    const m = modal();
    // Anything behind an open title pop-up doesn't count.
    const reachable = el && (!m || m.contains(el));
    if (reachable && el.isConnected && isVisible(el) && (!el.matches(CARD_SEL) || onScreenX(el))) return el;
    if (el) el.removeAttribute(FOCUS_ATTR);
    return null;
  }

  function setFocus(el) {
    document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((n) => n.removeAttribute(FOCUS_ATTR));
    if (!el) return;
    el.setAttribute(FOCUS_ATTR, '');
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
  }

  function initialFocus(cands) {
    const inView = cands
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.bottom > 60 && r.top < innerHeight - 20);
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
      // Sideways moves stay in the same row.
      if ((dir === 'left' || dir === 'right') && gap > 0) continue;
      const score = Math.max(0, primary) + gap * 3 + centerDiff * 0.3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ readers

  function describe(el) {
    if (!el) return null;
    if (el.matches(PROFILE_SEL)) return { kind: 'profile', title: clean(el.innerText) };
    if (el.matches(EPISODE_SEL)) {
      const ep = episodeInfo(el);
      return { kind: 'episode', title: ep.title, sub: ep.runtime };
    }
    if (el.matches(CARD_SEL) || el.matches('.titleCard--container')) {
      return {
        kind: 'title',
        title: clean(el.getAttribute('aria-label')) || clean(el.querySelector('.titleCard-title_text, [class*="title"]')?.textContent) || 'Title',
      };
    }
    return { kind: 'button', title: clean(el.getAttribute('aria-label') || el.innerText).slice(0, 60) };
  }

  // Same shape as Prime's episodes, so the phone shows both the same way.
  function episodeInfo(el, index) {
    const number = clean(el.querySelector('.titleCard-title_index')?.textContent);
    const name = clean(el.querySelector('.titleCard-title_text')?.textContent) || clean(el.getAttribute('aria-label'));
    return {
      index,
      title: number ? `${number}. ${name}` : name,
      runtime: clean(el.querySelector('.duration')?.textContent),
      left: el.classList.contains('current') ? 'Up next' : '',
    };
  }

  function detailInfo() {
    const m = modal();
    if (!m) return null;
    const title = clean(m.querySelector('.previewModal--boxart, .playerModel--player__storyArt')?.getAttribute('alt')) ||
      clean(m.querySelector('.previewModal--player-titleTreatment-logo')?.getAttribute('alt')) ||
      clean(document.title.replace(/\s*[|-]\s*Netflix.*$/i, ''));
    const play = m.querySelector('a[data-uia="play-button"], button[data-uia="play-button"]');
    return {
      title,
      playLabel: clean(play?.innerText) || null,
      season: clean(m.querySelector('[data-uia="dropdown-toggle"]')?.textContent) || null,
      episodes: [...m.querySelectorAll(EPISODE_SEL)].map((el, i) => episodeInfo(el, i)),
    };
  }

  function profiles() {
    if (pageType() !== 'profiles') return null;
    return [...document.querySelectorAll(PROFILE_SEL)].map((b) => clean(b.innerText)).filter(Boolean);
  }

  // Netflix removes the control bar (and the title in it) while it's hidden,
  // so remember what it said last time it was on screen.
  let memo = null;

  function playerButton(sel) {
    const el = document.querySelector(sel);
    return el && isVisible(el) ? el : null;
  }

  function skipButton() {
    const direct = playerButton('[data-uia^="player-skip"]');
    if (direct) return direct;
    return [...document.querySelectorAll('.watch-video button')].find((b) =>
      /^skip/i.test(clean(b.getAttribute('aria-label') || b.innerText)) && isVisible(b)) || null;
  }

  function nextButton() {
    return playerButton('[data-uia="next-episode-seamless-button"], [data-uia="next-episode-seamless-button-draining"], [data-uia="control-next"]');
  }

  function playerState() {
    if (pageType() !== 'player') return null;
    const v = video();
    if (!v) return null;
    const key = location.pathname;
    if (!memo || memo.key !== key) memo = { key, title: '', subtitle: '', hasNext: false };
    const titleEl = document.querySelector('[data-uia="video-title"]');
    if (titleEl) {
      const parts = [...titleEl.querySelectorAll('h4, span')].map((n) => clean(n.textContent)).filter(Boolean);
      memo.title = parts[0] || clean(titleEl.textContent);
      memo.subtitle = parts.slice(1).join(' · ');
    }
    if (document.querySelector('[data-uia="control-next"], [data-uia="control-episodes"]')) memo.hasNext = true;
    const skip = skipButton();
    const p = nfPlayer();
    return {
      title: memo.title || clean(document.title.replace(/\s*[|-]\s*Netflix.*$/i, '')),
      subtitle: memo.subtitle,
      currentTime: v.currentTime || 0,
      duration: isFinite(v.duration) ? v.duration : 0,
      paused: p ? p.isPaused() : v.paused,
      volume: Math.round((p ? p.getVolume() : v.volume) * 100),
      muted: p ? p.isMuted() : v.muted,
      skipLabel: skip ? clean(skip.getAttribute('aria-label') || skip.innerText) : null,
      hasNext: memo.hasNext || !!nextButton(),
      isAd: !!document.querySelector('[data-uia*="ads-info"], [data-uia*="ad-countdown"], [data-uia="ads-ui"]'),
      fullscreen: !!document.fullscreenElement,
    };
  }

  // Mark an element for Selenium to click with a real (trusted) mouse click.
  function markForClick(el) {
    document.querySelectorAll(`[${CLICK_ATTR}]`).forEach((n) => n.removeAttribute(CLICK_ATTR));
    if (!el) return false;
    el.setAttribute(CLICK_ATTR, '');
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    return true;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Netflix ignores synthetic key presses, so playback goes through its own
  // player API (the one browser extensions use). Times are in milliseconds.
  function nfPlayer() {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids = vp.getAllPlayerSessionIds();
      return ids.length ? vp.getVideoPlayerBySessionId(ids[ids.length - 1]) : null;
    } catch (e) {
      return null;
    }
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function seasonItems() {
    return [...document.querySelectorAll('li[data-uia="dropdown-menu-item"]')]
      .filter((li) => !/^see all/i.test(clean(li.innerText)));
  }

  const api = {
    version: VERSION,

    state() {
      return {
        pageType: pageType(),
        url: location.href,
        title: document.title,
        focus: describe(current()),
        profiles: profiles(),
        detail: detailInfo(),
        player: playerState(),
      };
    },

    // {moved, edge, page}: `page` asks Python to press the row's arrow.
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
      if ((dir === 'left' || dir === 'right') && cur.matches(CARD_SEL)) {
        const row = cur.closest(ROW_SEL);
        const arrow = row && row.querySelector(`[data-uia="carousel-hawkins-${dir}-button"]`);
        if (arrow) {
          row.setAttribute('data-nfr-row', dir);
          return { moved: false, edge: true, page: markForClick(arrow) };
        }
      }
      if (dir === 'down') window.scrollBy({ top: innerHeight * 0.7, behavior: 'smooth' });
      if (dir === 'up') window.scrollTo({ top: 0, behavior: 'smooth' });
      return { moved: false, edge: true };
    },

    // After a row was paged, focus the first new card on the side we moved to.
    afterPage() {
      const row = document.querySelector('[data-nfr-row]');
      if (!row) return false;
      const dir = row.getAttribute('data-nfr-row');
      row.removeAttribute('data-nfr-row');
      const cards = [...row.querySelectorAll(CARD_SEL)].filter((c) => isVisible(c) && onScreenX(c))
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const pick = dir === 'right' ? cards[0] : cards[cards.length - 1];
      if (pick) setFocus(pick);
      return !!pick;
    },

    // What OK should do with the focused element.
    select() {
      injectStyle();
      const cur = current();
      if (!cur) {
        setFocus(initialFocus(candidates()));
        return { action: 'focused' };
      }
      if (cur.matches(CARD_SEL) && cur.href) return { action: 'open', href: cur.href, ok: markForClick(cur) };
      const link = cur.matches('a[href]') ? cur : null;
      return { action: 'click', href: link && link.href, plays: /\/watch\//.test(link?.href || '') || cur.matches(EPISODE_SEL), ok: markForClick(cur) };
    },

    markProfile(i) { return markForClick(document.querySelectorAll(PROFILE_SEL)[i]); },

    // Returns the /watch link (if any) so Python can open it when the click
    // doesn't start playback.
    markPlay() {
      const m = modal() || document.querySelector('.billboard');
      const el = m && m.querySelector('a[data-uia="play-button"], button[data-uia="play-button"]');
      if (!markForClick(el)) return null;
      return { href: el.href || (el.closest('a[href*="/watch/"]') || {}).href || null };
    },

    markEpisode(i) {
      const m = modal();
      return markForClick(m && m.querySelectorAll(EPISODE_SEL)[i]);
    },

    markSkip() { return markForClick(skipButton()); },
    markNext() { return markForClick(nextButton()); },
    markControl(uia) { return markForClick(playerButton(`[data-uia^="${uia}"]`)); },

    closeModal() {
      const b = document.querySelector('[data-uia="previewModal-closebtn"]');
      if (b) b.click();
      return !!b;
    },

    // Season names live in a dropdown that only exists while it's open.
    async seasons() {
      const toggle = modal()?.querySelector('[data-uia="dropdown-toggle"]');
      if (!toggle) return [];
      toggle.click();
      await sleep(350);
      const names = seasonItems().map((li) => clean(li.querySelector('div')?.firstChild?.textContent || li.innerText));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (seasonItems().length) toggle.click();
      return names;
    },

    async pickSeason(i) {
      const toggle = modal()?.querySelector('[data-uia="dropdown-toggle"]');
      if (!toggle) return false;
      toggle.click();
      await sleep(350);
      const item = seasonItems()[i];
      if (!item) {
        toggle.click();
        return false;
      }
      item.click();
      await sleep(600);
      return true;
    },

    playPause() {
      const p = nfPlayer();
      if (!p) return false;
      if (p.isPaused()) p.play(); else p.pause();
      return true;
    },

    pause() {
      const p = nfPlayer();
      if (p && !p.isPaused()) {
        p.pause();
        return true;
      }
      const v = video();
      if (v && !v.paused) {
        v.pause();
        return true;
      }
      return false;
    },

    seek(seconds) {
      const p = nfPlayer();
      if (!p) return false;
      p.seek(clamp(p.getCurrentTime() + seconds * 1000, 0, p.getDuration() - 1000));
      return true;
    },

    volume(delta) {
      const p = nfPlayer();
      if (!p) return null;
      if (delta > 0 && p.isMuted()) p.setMuted(false);
      p.setVolume(clamp(p.getVolume() + delta / 100, 0, 1));
      return Math.round(p.getVolume() * 100);
    },

    toggleMute() {
      const p = nfPlayer();
      if (!p) return false;
      p.setMuted(!p.isMuted());
      return p.isMuted();
    },

    clearFocus() { setFocus(null); },
  };

  window.__nfr = api;
  injectStyle();
})();
