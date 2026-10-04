"""Keeps the remote's Chrome tabs in a fixed order: YouTube, Prime Video,
Netflix, Jellyfin, Viki, then the QR-code page, reopening any that get closed.

Chrome can't move a tab to a given position (new tabs always open at the
end), so when a tab is missing, it and every managed tab after it are
reopened in order. The later ones reopen at the URL they were on, so e.g. a
Netflix episode picks up again where it was. Closing the QR tab (the last
one) disturbs nothing else. Tabs you open yourself are left alone.

A tab parked by tabPark ("about:blank#parked-<app>") counts as present —
that's the app's tab with its memory freed, waiting to be landed on again.
"""

from beat import Beat
from tabPark import PARK_PREFIX


class TabKeeper(Beat):
    LABEL = "Tab keeper"

    def __init__(self, session, tabs):
        """`tabs`: [(name, homeUrl, urlMarker)] in the order to keep."""
        super().__init__(session)
        self.tabs = tabs
        self.ids = {}  # name -> Chrome tab id

    def appMarkers(self):
        """{name: URL marker} for the app tabs (everything but the QR page)."""
        return {name: marker for name, _, marker in self.tabs if name != "qr"}

    def claimExisting(self, live):
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
        live = {t["id"]: t for t in self.session.tabList()}
        if not live:
            return []
        self.claimExisting(live)
        missing = [i for i, (name, _, _) in enumerate(self.tabs) if self.ids.get(name) not in live]
        if not missing:
            return []

        later = self.tabs[missing[0]:]
        # Close the managed tabs after the gap, remembering where they were...
        urls = {}
        for name, _, _ in later:
            tab = live.get(self.ids.get(name))
            if tab:
                urls[name] = tab.get("url")
                self.session.closeTab(tab["id"])
        # ...then open everything from the gap onwards, in order.
        for name, home, _ in later:
            self.ids[name] = self.session.newBackgroundTab(urls.get(name) or home)
        return [name for name, _, _ in later]

    def tick(self):
        reopened = self.check()
        if reopened:
            print(f"Reopened tabs: {', '.join(reopened)}")
