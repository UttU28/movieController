"""Free the memory of the Chrome tabs that aren't in use, without losing them.

Powering off — and switching to another app — "ends" the tabs left behind:
first the last thing each was showing is captured (its URL, the position any
video had reached, and whether it was playing), then the tab is sent to
about:blank. That releases the page's JavaScript, its video decoders and its
whole memory footprint, while the tab itself (and the tab keeper's order)
stays in place. Turning the remote back on, or switching to that app again,
navigates the parked tab straight back to its saved page and seeks to the
saved position. Sites also remember positions on their servers, so even when
the seek misses, the reload lands on the same title at roughly the same spot.

A parked tab keeps a marker fragment — "about:blank#parked-netflix" — so the
tab keeper still recognises it after a backend restart. The park records
themselves live in parked_tabs.json, which keeps resumes working across a
backend restart too.
"""

import json
import threading
import time
from pathlib import Path

PARK_FILE = Path(__file__).resolve().parent / "parked_tabs.json"
PARK_PREFIX = "about:blank#parked-"

# How long to wait for a parked tab's navigation to land before moving on,
# and how long the seek/resume helper keeps trying while the page loads.
WAIT_SECONDS = 4
RESUME_TRIES = 12

# The video the user is actually watching: a playing one, else one that has
# started, else the first. These sites keep more than one <video> around.
_STATE_JS = """
(() => { try {
  const vs = [...document.querySelectorAll('video')];
  const v = vs.find(x => !x.paused && x.currentTime > 0) || vs.find(x => x.currentTime > 0) || vs[0];
  return JSON.stringify({
    url: location.href,
    t: v && isFinite(v.currentTime) ? Math.round(v.currentTime) : 0,
    playing: !!(v && !v.paused && !v.ended && v.currentTime > 0),
  });
} catch (e) { return '{}'; } })()
"""

# Run after the tab is back on its page: once the media has metadata, jump to
# the saved position (only if the page is far from it and long enough for it).
# Answers true when done, or false when nothing has loaded yet.
_SEEK_JS = """
(() => { try {
  const vs = [...document.querySelectorAll('video')];
  const v = vs.find(x => !x.paused && x.currentTime > 0) || vs.find(x => x.currentTime >= 0) || vs[0];
  if (!v || v.readyState < 1) return false;
  const want = %d;
  if (want > 5 && isFinite(v.duration) && v.duration > want + 5 && Math.abs(v.currentTime - want) > 3) {
    v.currentTime = want;
  }
  return true;
} catch (e) { return false; } })()
"""

# ...and press play if it was playing when parked. (The browser may refuse
# until the user touches it; the catch keeps that quiet.)
_PLAY_JS = """
(() => { try {
  const vs = [...document.querySelectorAll('video')];
  const v = vs.find(x => x.currentTime >= 0) || vs[0];
  if (!v || v.readyState < 2) return false;
  if (v.paused) v.play().catch(() => {});
  return true;
} catch (e) { return false; } })()
"""


class TabPark:
    def __init__(self, session, keeper):
        self.session = session
        # name -> URL marker, from the keeper's tab list (the QR tab is never parked).
        self.markers = {name: marker for name, _, marker in keeper.tabs if name != "qr"}
        self._lock = threading.Lock()
        self.records = {}  # name -> {url, t, playing, tabId, at}
        try:
            saved = json.loads(PARK_FILE.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                self.records = {
                    n: r for n, r in saved.items()
                    if isinstance(r, dict) and str(r.get("url") or "").startswith("http")
                }
        except (OSError, json.JSONDecodeError):
            pass

    # ------------------------------------------------------------------ tabs

    def _find(self, name, require_site=False):
        """The tab for an app: a parked one (by its marker fragment), else, if
        not require_site, a tab the record still points at sitting on
        about:blank, else a tab showing the site itself. None if there isn't one."""
        marker = self.markers.get(name) or ""
        rec = self.records.get(name)
        for tab in self.session._tab_list():
            url = tab.get("url") or ""
            if url.startswith(PARK_PREFIX + name):
                return tab
            if require_site:
                if marker and marker in url:
                    return tab
            else:
                if rec and tab["id"] == rec.get("tabId") and url.startswith("about:blank"):
                    return tab
                if marker and marker in url:
                    return tab
        return None

    def _save(self):
        try:
            PARK_FILE.write_text(json.dumps(self.records, indent=1), encoding="utf-8")
        except OSError:
            pass

    # ------------------------------------------------------------------ park

    def park(self, name):
        """Capture where this app's tab is and send it to about:blank.
        Returns True if the tab is parked afterwards (or already was)."""
        with self._lock:
            tab = self._find(name, require_site=True)
            if tab is None:
                return False
            url = tab.get("url") or ""
            if url.startswith(PARK_PREFIX + name):
                return True
            state = {}
            try:
                state = json.loads(self.session.eval_in_tab(tab, _STATE_JS, timeout=2.5) or "{}")
            except Exception:
                pass  # A hung page still gets parked; just without a position.
            if not str(state.get("url") or "").startswith("http"):
                state = {"url": url, "t": 0, "playing": False}
            rec = {
                "url": state["url"],
                "t": int(state.get("t") or 0),
                "playing": bool(state.get("playing")),
                "tabId": tab["id"],
                "at": time.time(),
            }
            try:
                self.session.eval_in_tab(
                    tab, "location.replace(%s)" % json.dumps(PARK_PREFIX + name), timeout=2.5
                )
            except Exception as e:
                print(f"park {name} failed: {e}")
                return False
            self.records[name] = rec
            self._save()
            print(f"Parked {name} at {rec['t']}s ({rec['url'][:60]})")
            return True

    def park_all(self, keep=None):
        """Park every app tab except `keep` (and any that are already gone)."""
        for name in list(self.markers):
            if name == keep:
                continue
            try:
                self.park(name)
            except Exception as e:
                print(f"park {name} failed: {e}")

    # ---------------------------------------------------------------- restore

    def land(self, name):
        """Put the app's tab back on the page it was parked from (no-op when
        nothing is saved for it) and seek/resume in the background. Called
        before and after showing the app, so it's safe to call freely."""
        if name not in self.records:
            return
        with self._lock:
            rec = self.records.get(name)
            if rec is None:
                return
            tab = self._find(name)
            if tab is None:
                return  # No tab to land on yet; keep the record for next time.
            marker = self.markers.get(name) or ""
            want = rec["url"]
            if (tab.get("url") or "") != want:
                try:
                    self.session.eval_in_tab(tab, "location.replace(%s)" % json.dumps(want), timeout=2.5)
                except Exception as e:
                    print(f"unpark {name} failed: {e}")
                    return
                # Wait for the navigation to land, so whoever follows
                # (use_tab, run) finds the tab already on its site.
                until = time.time() + WAIT_SECONDS
                while time.time() < until:
                    again = self._find(name)
                    url = (again or {}).get("url") or ""
                    if (again or {}).get("id") == tab["id"] and url != PARK_PREFIX + name and (not marker or marker in url):
                        break
                    time.sleep(0.25)
            self.records.pop(name, None)
            self._save()
        threading.Thread(target=self._resume_media, args=(name, rec), daemon=True).start()

    def _resume_media(self, name, rec):
        """While the page loads, jump to the saved position and press play."""
        t = int(rec.get("t") or 0)
        want_play = bool(rec.get("playing"))
        if t < 5 and not want_play:
            return
        marker = self.markers.get(name) or ""
        seeked = t < 5
        played = not want_play
        until = time.time() + RESUME_TRIES
        while time.time() < until and not (seeked and played):
            tab = self._find(name)
            url = (tab or {}).get("url") or ""
            if tab is None or url.startswith(PARK_PREFIX + name):
                return  # Gone, or parked again while we waited: give up quietly.
            if marker and marker not in url:
                time.sleep(1)
                continue
            try:
                if not seeked:
                    seeked = bool(self.session.eval_in_tab(tab, _SEEK_JS % t, timeout=2.5))
                if seeked and not played:
                    played = bool(self.session.eval_in_tab(tab, _PLAY_JS, timeout=2.5))
            except Exception:
                pass  # The page isn't ready yet; try the next second.
            time.sleep(1)
