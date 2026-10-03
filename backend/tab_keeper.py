"""Keeps the remote's Chrome tabs in a fixed order: YouTube, Prime Video,
Netflix, Jellyfin, Viki, then the QR-code page, reopening any that get closed.

Chrome can't move a tab to a given position (new tabs always open at the
end), so when a tab is missing, it and every managed tab after it are
reopened in order. The later ones reopen at the URL they were on, so e.g. a
Netflix episode picks up again where it was. Closing the QR tab (the last
one) disturbs nothing else. Tabs you open yourself are left alone.

A tab parked by tab_park ("about:blank#parked-<app>") counts as present —
that's the app's tab with its memory freed, waiting to be landed on again.
"""

import threading
import time

from tab_park import PARK_PREFIX

CHECK_SECONDS = 2


class TabKeeper:
    def __init__(self, session, tabs):
        """`tabs`: [(name, home_url, url_marker)] in the order to keep."""
        self.session = session
        self.tabs = tabs
        self.ids = {}  # name -> Chrome tab id
        self._stop = threading.Event()

    def _claim_existing(self, live):
        """Adopt already-open tabs (e.g. after a backend restart) by URL."""
        claimed = set(self.ids.values())
        for name, _, marker in self.tabs:
            if self.ids.get(name) in live:
                continue
            for tab in live.values():
                url = tab.get("url") or ""
                if tab["id"] not in claimed and (marker in url or url.startswith(PARK_PREFIX + name)):
                    self.ids[name] = tab["id"]
                    claimed.add(tab["id"])
                    break

    def check(self):
        """Reopen missing tabs so the order stays intact. Returns the names
        that were (re)opened."""
        live = {t["id"]: t for t in self.session._tab_list()}
        if not live:
            return []
        self._claim_existing(live)
        missing = [i for i, (name, _, _) in enumerate(self.tabs) if self.ids.get(name) not in live]
        if not missing:
            return []

        first = missing[0]
        reopened = []
        # Close the managed tabs after the gap, remembering where they were...
        urls = {}
        for name, _, _ in self.tabs[first:]:
            tab = live.get(self.ids.get(name))
            if tab:
                urls[name] = tab.get("url")
                self.session.close_tab(tab["id"])
        # ...then open everything from the gap onwards, in order.
        for name, home, _ in self.tabs[first:]:
            self.ids[name] = self.session.new_background_tab(urls.get(name) or home)
            reopened.append(name)
        return reopened

    def run_forever(self):
        while not self._stop.wait(CHECK_SECONDS):
            # Skip this round if Chrome is busy; there's another in 2 seconds.
            if not self.session.lock.acquire(timeout=1):
                continue
            try:
                # Only while Chrome is running; never relaunch it from here.
                if self.session.connect(launch=False):
                    reopened = self.check()
                    if reopened:
                        print(f"Reopened tabs: {', '.join(reopened)}")
            except Exception as e:
                print(f"Tab keeper: {e}")
            finally:
                self.session.lock.release()

    def start(self):
        threading.Thread(target=self.run_forever, daemon=True).start()

    def stop(self):
        self._stop.set()
