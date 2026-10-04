"""Background jobs that run on their own beat (tab keeper, cursor warden,
auto-skip), next to the requests the phone makes."""

import threading


class Beat:
    """A background job that runs tick() every INTERVAL seconds until stop().
    With NEEDS_CHROME, a beat is skipped while Chrome is busy with a command
    or not running (it's never relaunched from here)."""

    LABEL = ""
    INTERVAL = 2.0
    NEEDS_CHROME = True

    def __init__(self, session):
        self.session = session
        self.stopped = threading.Event()

    def tick(self):
        raise NotImplementedError

    def runForever(self):
        while not self.stopped.wait(self.INTERVAL):
            if self.NEEDS_CHROME and not self.session.lock.acquire(timeout=1):
                continue  # there's another beat soon
            try:
                if not self.NEEDS_CHROME or self.session.connect(launch=False):
                    self.tick()
            except Exception as e:
                print(f"{self.LABEL}: {e}")
            finally:
                if self.NEEDS_CHROME:
                    self.session.lock.release()

    def start(self):
        threading.Thread(target=self.runForever, daemon=True).start()

    def stop(self):
        self.stopped.set()
