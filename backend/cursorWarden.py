"""Keeps the mouse pointer findable on the TV.

Players and fullscreen Chrome hide the real cursor, so when you move the
mouse (by hand or through the phone's pointer remote) there's nothing to
see. This installs pageScripts/warden.js in every managed tab: it draws a
ring at the pointer while it moves — only where the real cursor is hidden —
which fades out 5 seconds after it stops. The Home screen (qr.html) carries
the same ring in its own page, so that one is skipped here.
"""

from beat import Beat
from chromeSession import pageScript

WARDEN_JS = pageScript("warden.js")


class CursorWarden(Beat):
    LABEL = "Cursor warden"

    def __init__(self, session, keeper):
        super().__init__(session)
        self.markers = list(keeper.appMarkers().values())

    def tick(self):
        """Tell every open app tab the ring is on duty, and whether Chrome's
        window is TV-mode fullscreen (only the backend can know that)."""
        expression = f"{WARDEN_JS}\nwindow.__vkw.install({'true' if self.session.tvMode else 'false'});"
        for tab in self.session.tabList():
            url = tab.get("url") or ""
            if not any(marker in url for marker in self.markers):
                continue
            try:
                # Parked tabs (about:blank) don't match any marker; hung pages
                # just get tried again on the next beat.
                self.session.evalInTab(tab, expression, timeout=2.5)
            except Exception:
                pass
