"""Powers the remote off by itself when nobody's watching.

After IDLE_SLEEP_MINUTES with nothing happening — no command from any phone
and no video playing in any tab — the remote powers off the way the phone's
power button does: the app tabs are parked (places remembered), Chrome goes
back to the Home (QR) screen and every phone drops to its power screen.

A video that's playing holds it awake (a paused one doesn't: pausing counts
as nothing happening, and the minutes are then counted from the pause).
Chrome only lets pages autoplay with sound after real user interaction, and
browse-page previews autoplay muted, so the muted check keeps Netflix's
billboard trailers from counting as "you're watching something".

IDLE_SLEEP=false turns this off; IDLE_SLEEP_MINUTES changes the wait.
"""

import time

from beat import Beat
from tabPark import PARK_PREFIX

# One video playing with sound means someone (or something worth keeping)
# is watching. Paused, ended, preroll (currentTime 0) and muted autoplay
# previews all say "nothing is happening" instead.
PLAYING_JS = """(() => { try {
  return [...document.querySelectorAll('video')].some((v) =>
    !v.paused && !v.ended && v.currentTime > 0 && !v.muted);
} catch (e) { return false; } })()"""


class SleepWatch(Beat):
    LABEL = "Sleep"
    INTERVAL = 15.0
    NEEDS_CHROME = False  # reads tabs over their own sockets, like auto-skip

    def __init__(self, session, activity, modeState, powerOff, minutes=10, enabled=True):
        super().__init__(session)
        self.activity = activity      # {"at": when the phone last sent a command}
        self.modeState = modeState    # only ever asleep from "on"
        self.powerOff = powerOff      # the same off-switch the phone's button runs
        self.minutes = minutes
        self.enabled = enabled

    def tick(self):
        if not self.enabled:
            return
        if self.modeState.get("power") != "on":
            self.activity["at"] = time.time()  # the wait starts fresh when powered back on
            return
        for tab in self.session.tabList():
            url = tab.get("url") or ""
            if not url.startswith("http") or url.startswith(PARK_PREFIX):
                continue  # parked tabs and Chrome's own pages have nothing to watch
            try:
                playing = self.session.evalInTab(tab, PLAYING_JS, timeout=2)
            except Exception:
                continue  # a hung or loading page; there's another beat soon
            if playing:
                self.activity["at"] = time.time()  # something's on: the wait starts over
                return
        if time.time() - self.activity["at"] >= self.minutes * 60:
            self.fallAsleep()

    def fallAsleep(self):
        print(f"Sleep: nothing playing and no commands for {int(self.minutes)} min — powering off")
        try:
            self.powerOff()
        except Exception as e:
            # Stay awake and try again in a bit rather than half-park things.
            print(f"Sleep: power off failed: {e}")
            self.activity["at"] = time.time()
