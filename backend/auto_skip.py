"""Skips whatever the streaming sites let you skip, by itself.

Every second or so, each open app tab is checked for a Skip button (skip.js:
YouTube's Skip Ad, Netflix/Prime/Viki/Jellyfin Skip Intro, Skip Recap, Skip
Credits, a skippable Prime ad...) or an ad from Google's IMA player (Viki),
which has no button we can reach and is run to its end instead. When one shows up it gets a real mouse
click over the tab's own DevTools socket, so it never waits on the WebDriver
lock or switches tabs (a page that's off screen gets a scripted click
instead). If the button is still there after a few clicks, it's
left for the phone, which shows its Skip button.

Each outcome becomes an event the phone reads with /state ("Skipped intro",
"Couldn't skip the ad"), so you can see it happened.

Runs on its own beat, like the tab keeper. AUTO_SKIP=false turns it off.
"""

import itertools
import threading
import time
from pathlib import Path

from tab_park import PARK_PREFIX

BASE_DIR = Path(__file__).resolve().parent
SKIP_JS = (BASE_DIR / "skip.js").read_text(encoding="utf-8")

# Runs an IMA ad (see skip.js) to its last moment; the ad player then wraps
# up the break and the show resumes on its own.
JUMP_JS = """(() => {
  const box = document.querySelector('.ima-ad-container');
  if (!box || getComputedStyle(box).display === 'none') return false;
  const ads = [...document.querySelectorAll('video')].filter((v) =>
    (v.currentSrc || v.src) && !v.paused && isFinite(v.duration) && v.duration > 0 && v.duration <= 180);
  ads.forEach((v) => { v.currentTime = Math.max(0, v.duration - 0.15); });
  return ads.length > 0;
})()"""

# After running an ad to its end, the show should carry on by itself; if it
# is still paused (and no ad is on) this long after, press play for it.
RESUME_JS = """(() => {
  const box = document.querySelector('.ima-ad-container');
  if (box && getComputedStyle(box).display !== 'none' && box.getBoundingClientRect().height > 10) return false;
  const show = document.querySelector('video.vjs-tech');
  if (!show || !show.paused || show.ended) return false;
  show.play().catch(() => {});
  return true;
})()"""
RESUME_AFTER = (3, 10)  # seconds after the skip: from, until

CHECK_SECONDS = 1.0
# Clicks per button before giving up on it, and the gap between them.
MAX_TRIES = 3
RETRY_SECONDS = 1.2
CLICK_TIMEOUT = 1.5
# How long the phone keeps hearing about an event.
EVENT_SECONDS = 45


class AutoSkip:
    def __init__(self, session, keeper, enabled=True):
        self.session = session
        self.enabled = enabled
        # (name, URL marker) for each app tab; the QR tab has nothing to skip.
        self.apps = [(name, marker) for name, _, marker in keeper.tabs if name != "qr"]
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._ids = itertools.count(1)
        self._events = []  # {id, app, kind, label, ok, at}
        self._pending = {}  # tab id -> {app, key, label, kind, tries, last}
        self._jumped = {}  # tab id -> when an ad there was last run to its end

    # ------------------------------------------------------------------ events

    def _event(self, app, button, ok):
        with self._lock:
            self._events.append({
                "id": next(self._ids), "app": app, "kind": button["kind"],
                "label": button["label"], "ok": ok, "at": time.time(),
            })
            self._events = self._events[-20:]
        verb = "skipped" if ok else "could not skip"
        print(f"Auto-skip: {app} {verb} '{button['label']}'")

    def events(self, app):
        """Recent skip events for one app, newest last, with their age."""
        now = time.time()
        with self._lock:
            return [
                {**{k: e[k] for k in ("id", "kind", "label", "ok")}, "age": round(now - e["at"], 1)}
                for e in self._events
                if e["app"] == app and now - e["at"] < EVENT_SECONDS
            ]

    # ------------------------------------------------------------------ checks

    def _app_for(self, url):
        if url.startswith(PARK_PREFIX):
            return None
        return next((name for name, marker in self.apps if marker in url), None)

    def check(self):
        seen = set()
        for tab in self.session._tab_list():
            app = self._app_for(tab.get("url") or "")
            if app is None:
                continue
            seen.add(tab["id"])
            try:
                button = self.session.eval_in_tab(tab, SKIP_JS, timeout=2)
            except Exception:
                continue  # a hung or loading page; there's another beat soon
            self._handle(tab, app, button)
            self._resume(tab)
        # Tabs that closed or were parked: forget what they were showing.
        for tab_id in list(self._pending):
            if tab_id not in seen:
                self._pending.pop(tab_id, None)
        for tab_id in list(self._jumped):
            if tab_id not in seen:
                self._jumped.pop(tab_id, None)

    def _handle(self, tab, app, button):
        pending = self._pending.get(tab["id"])
        if pending and (not button or button["key"] != pending["key"]):
            # The button we clicked is gone: that's a skip. (One that already
            # failed was reported then; one that vanished by itself before
            # any click doesn't count.)
            if pending["tries"] and not pending.get("failed"):
                self._event(app, pending, True)
            self._pending.pop(tab["id"], None)
            pending = None
        if not button:
            return
        if pending is None:
            pending = {**button, "app": app, "tries": 0, "last": 0.0}
            self._pending[tab["id"]] = pending
        if pending.get("failed"):
            return  # left for the phone's Skip button
        now = time.time()
        if now - pending["last"] < RETRY_SECONDS:
            return
        if pending["tries"] >= MAX_TRIES:
            pending["failed"] = True
            self._event(app, pending, False)
            try:
                # Look past it from now on, so another Skip on the page still gets pressed.
                self.session.eval_in_tab(
                    tab, "document.querySelector('[data-autoskip]')?.setAttribute('data-autoskip-failed', ''); true", timeout=2)
            except Exception:
                pass
            return
        pending["tries"] += 1
        pending["last"] = now
        self._click(tab, app, button)

    def _click(self, tab, app, button):
        """A real click when the page is on screen; otherwise, or if that
        doesn't go through, a scripted one (most sites accept it, YouTube
        doesn't). An IMA ad with nothing to click is run to its end."""
        if button.get("jump"):
            try:
                self.session.eval_in_tab(tab, JUMP_JS, timeout=2)
                self._jumped[tab["id"]] = time.time()
            except Exception as e:
                print(f"Auto-skip on {app} failed: {e}")
            return
        if button.get("visible"):
            try:
                self.session.click_in_tab(tab, button["x"], button["y"], timeout=CLICK_TIMEOUT)
                return
            except Exception:
                pass
        try:
            self.session.eval_in_tab(tab, "document.querySelector('[data-autoskip]')?.click(); true", timeout=2)
        except Exception as e:
            print(f"Auto-skip click on {app} failed: {e}")

    def _resume(self, tab):
        at = self._jumped.get(tab["id"])
        if at is None:
            return
        since = time.time() - at
        if since > RESUME_AFTER[1]:
            self._jumped.pop(tab["id"], None)
        elif since >= RESUME_AFTER[0]:
            try:
                if self.session.eval_in_tab(tab, RESUME_JS, timeout=2):
                    print("Auto-skip: resumed the show after an ad")
                    self._jumped.pop(tab["id"], None)
            except Exception:
                pass

    # ------------------------------------------------------------------ loop

    def run_forever(self):
        while not self._stop.wait(CHECK_SECONDS):
            if not self.enabled:
                continue
            try:
                self.check()
            except Exception as e:
                print(f"Auto-skip: {e}")

    def start(self):
        threading.Thread(target=self.run_forever, daemon=True).start()

    def stop(self):
        self._stop.set()
