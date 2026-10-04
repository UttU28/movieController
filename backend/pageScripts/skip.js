// Run in an app tab by autoSkip.py: finds a Skip button the site is showing
// right now (ad, intro, recap, credits...) and says where to click it.
// Returns null, or {key, label, kind, x, y, visible}: where to click, in
// viewport pixels, and whether the page is on screen (Chrome holds back real
// mouse input from a page that isn't). The button is also tagged
// data-autoskip, for a scripted click when a real one can't be sent.
//
// Ads played through Google's IMA player (Viki) have no Skip button we can
// reach (it lives in a cross-site frame), so for those it returns
// {key, label, kind: 'ad', jump: true}: autoSkip runs the ad to its end
// (JUMP_JS in autoSkip.py), and the player carries on with the show.
(() => {
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

  // Site buttons known to be skip buttons, whatever their wording.
  const KNOWN = [
    '.ytp-skip-ad-button', '.ytp-ad-skip-button', '.ytp-ad-skip-button-modern', "button[id^='skip-button']",
    '[data-uia^="player-skip"]',
    '.atvwebplayersdk-skipelement-button', '.adSkipButton',
    '.skip-button',
  ].join(',');

  // "Skip", "Skip Ad", "Skip Intro", "Skip Recap"... but not the seek buttons
  // ("Skip back 10 seconds", "Skip forward") or a countdown.
  const LABEL_RE = /^skip\b/i;
  const NOT_RE = /^skip (back|forward|ahead)|seconds?$|\b\d+\s*s$/i;

  function label(el) {
    return clean(el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('title'));
  }

  function shown(el) {
    if (el.classList.contains('hide') || el.disabled) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    for (let n = el, i = 0; n && n !== document.body && i < 8; n = n.parentElement, i++) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) return false;
    }
    return true;
  }

  // The ad video IMA is playing right now (not the tail end, where IMA is
  // already finishing up), or null.
  function imaAd() {
    const box = document.querySelector('.ima-ad-container');
    if (!box || getComputedStyle(box).display === 'none' || box.getBoundingClientRect().height < 10) return null;
    return [...document.querySelectorAll('video')].find((v) =>
      (v.currentSrc || v.src) && !v.paused && isFinite(v.duration) && v.duration > 0 && v.duration <= 180 &&
      v.currentTime > 0.3 && v.currentTime < v.duration - 0.5) || null;
  }

  const found = [...document.querySelectorAll(KNOWN)]
    .concat([...document.querySelectorAll('button, [role="button"]')].filter((b) => LABEL_RE.test(label(b))))
    .find((el) => {
      const t = label(el);
      // One auto-skip already gave up on is left for the phone's button.
      return t && !NOT_RE.test(t) && !el.hasAttribute('data-autoskip-failed') && shown(el);
    });
  document.querySelectorAll('[data-autoskip]').forEach((n) => n !== found && n.removeAttribute('data-autoskip'));
  if (!found) {
    const ad = imaAd();
    return ad ? { key: 'ad:' + (ad.currentSrc || ad.src), label: 'Ad', kind: 'ad', jump: true } : null;
  }
  found.setAttribute('data-autoskip', '');

  const r = found.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
  const t = label(found);
  const kind = /\bads?\b/i.test(t) || /(^|[\s-])ad-|adskip/i.test(String(found.className || '')) || found.id.startsWith('skip-button')
    ? 'ad'
    : /intro|opening/i.test(t) ? 'intro'
      : /recap/i.test(t) ? 'recap'
        : /credit/i.test(t) ? 'credits'
          : 'content';
  return { key: t, label: t.slice(0, 40), kind, x, y, visible: document.visibilityState === 'visible' };
})()
