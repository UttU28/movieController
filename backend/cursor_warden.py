"""Keeps the mouse pointer findable on the TV.

Players and fullscreen Chrome hide the real cursor, so when you move the
mouse (by hand or through the phone's pointer remote) there's nothing to
see. This installs warden.js in every managed tab: it draws a ring at the
pointer while it moves — only where the real cursor is hidden — which fades
out 5 seconds after it stops. The Home screen (qr.html) carries the same ring
in its own page, so that one is skipped here.

Runs on its own beat, like the tab keeper, and never relaunches Chrome.
"""

import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
WARDEN_JS = (BASE_DIR / "warden.js").read_text(encoding="utf-8")

CHECK_SECONDS = 2


class CursorWarden:
    def __init__(self, session, keeper):
        self.session = session
        # The sites the keeper looks after (the qr tab is excluded: qr.html
        # ships its own copy of the ring).
        self.markers = [marker for name, _, marker in keeper.tabs if name != "qr"]
        self._stop = threading.Event()

    def inject(self):
        """Tell every open app tab the ring is on duty, and whether Chrome's
        window is TV-mode fullscreen (only the backend can know that)."""
        expr = WARDEN_JS + "\nwindow.__vkw.install(%s);" % (
            "true" if self.session.tv_mode else "false"
        )
        for tab in self.session._tab_list():
            url = tab.get("url") or ""
            if not any(marker in url for marker in self.markers):
                continue
            try:
                # Parked tabs (about:blank) don't match any marker; hung pages
                # just get tried again on the next beat.
                self.session.eval_in_tab(tab, expr, timeout=2.5)
            except Exception:
                pass

    def run_forever(self):
        while not self._stop.wait(CHECK_SECONDS):
            if not self.session.lock.acquire(timeout=1):
                continue  # Chrome is busy with a command; there's another beat soon
            try:
                if self.session.connect(launch=False):
                    self.inject()
            except Exception as e:
                print(f"Cursor warden: {e}")
            finally:
                self.session.lock.release()

    def start(self):
        threading.Thread(target=self.run_forever, daemon=True).start()

    def stop(self):
        self._stop.set()
