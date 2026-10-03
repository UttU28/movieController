// Synthetic mouse pointer for pages that hide the real one.
//
// In fullscreen and TV mode the cursor can vanish completely (players set
// cursor: none; Chrome also hides its own pointer over fullscreen video), so
// moving the mouse — from the app's pointer remote or a real mouse — gives no
// idea where you are. This draws a ring at the pointer instead: it appears
// while the pointer moves, follows it, and fades out 5 seconds after it
// stops. It only draws when the real cursor wouldn't be visible — over a page
// that hid its cursor, or over fullscreen video where Chrome hides it. When
// the real cursor is showing, nothing is drawn.
//
// Installed by the backend (cursor_warden.py) into every managed tab every
// couple of seconds; the version guard makes a re-inject a no-op, and a page
// reload simply reinstalls it.
(() => {
  const VERSION = 1;
  const IDLE_MS = 5000;
  let ring = null, host = null, timer = null, frame = null;
  let last = { x: 0, y: 0 };
  let tv = false; // Chrome's window is TV-mode fullscreen (the backend knows)

  function ensureRing() {
    // A fullscreen element hides everything outside it, so the ring has to
    // live inside whatever is currently fullscreen.
    const want = document.fullscreenElement || document.body || document.documentElement;
    if (!ring || !ring.isConnected) {
      ring = document.createElement('div');
      ring.id = 'vkw-ring';
      ring.setAttribute('aria-hidden', 'true');
      ring.style.cssText =
        'position:fixed;z-index:2147483647;width:36px;height:36px;margin:-18px 0 0 -18px;' +
        'border:3px solid #fff;border-radius:50%;pointer-events:none;left:0;top:0;opacity:0;' +
        'box-shadow:0 0 0 2px rgba(0,0,0,.6),0 0 16px rgba(0,0,0,.5);transition:opacity .3s';
      want.appendChild(ring);
    } else if (ring.parentElement !== want) {
      want.appendChild(ring); // follow the page into and out of fullscreen
    }
    host = want;
  }

  function hiddenUnder(x, y) {
    let el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { /* detached */ }
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).cursor;
      if (c === 'none') return true;
      if (c && c !== 'auto' && c !== 'inherit') break; // an explicit cursor wins
    }
    if (document.fullscreenElement || tv) {
      // Chrome hides its own pointer over (near-)fullscreen video and the
      // page has no way to tell us; assume it's hidden there.
      const v = document.querySelector('video');
      if (v) {
        const r = v.getBoundingClientRect();
        if (r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.4) return true;
      }
    }
    return false;
  }

  function paint() {
    frame = null;
    const x = last.x, y = last.y;
    if (timer) clearTimeout(timer);
    if (!hiddenUnder(x, y)) {
      if (ring) ring.style.opacity = '0';
      return; // the real cursor is the one they can see
    }
    ensureRing();
    ring.style.left = x + 'px';
    ring.style.top = y + 'px';
    ring.style.opacity = '1';
    timer = setTimeout(() => { if (ring) ring.style.opacity = '0'; }, IDLE_MS);
  }

  function onMove(e) {
    last = { x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  }

  window.__vkw = {
    version: VERSION,
    install(tvOn) { tv = !!tvOn; },
  };
  addEventListener('pointermove', onMove, { capture: true, passive: true });
  addEventListener('pointerdown', onMove, { capture: true, passive: true });
})();
