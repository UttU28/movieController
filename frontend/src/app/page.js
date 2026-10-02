"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPowerOff } from "@fortawesome/free-solid-svg-icons";
import AppSwitcher, { APPS as SWITCHER_APPS, slideMs } from "../components/AppSwitcher";
import LaptopBubble from "../components/LaptopBubble";
import LaptopDrawer from "../components/LaptopDrawer";
import PowerScreen from "../components/PowerScreen";
import { buzz } from "../components/RemoteButton";
import { getMode, setMode, setPower, showApp, toggleTv } from "../lib/api";
import usePcVolumeKeys from "../lib/usePcVolumeKeys";
import JellyfinPanel from "../panels/JellyfinPanel";
import LaptopPanel, { TrackpadStatus } from "../panels/LaptopPanel";
import NetflixPanel from "../panels/NetflixPanel";
import PrimePanel from "../panels/PrimePanel";
import YouTubePanel from "../panels/YouTubePanel";

const WEB_APPS = new Set(["youtube", "prime", "netflix", "jellyfin"]);
const THEME_COLORS = { laptop: "#0d0e12", youtube: "#0f0f0f", prime: "#0b1219", netflix: "#141414", jellyfin: "#0e1116" };
const POLL_MS = 4000;
// After picking an app here, ignore polls that still report the old one.
const PICK_HOLD_MS = 6000;

export default function Home() {
  const [app, setApp] = useState(null);
  // Shared with the backend (and every other phone): power, QR theme, and
  // the last app used (the backend's lastApp is the source of truth).
  const [remote, setRemote] = useState({ power: "off", mode: "night", tvMode: false, lastApp: null });
  // Opening the page always starts on the power screen.
  const [standby, setStandby] = useState(true);
  const pickedAt = useRef(0);
  const [busy, setBusy] = useState(false);
  // Laptop control: a floating bubble, a slide-up drawer, or the full page.
  const [laptop, setLaptop] = useState(null); // null | "drawer" | "full"
  const [drawerClose, setDrawerClose] = useState(0);
  const [padStatus, setPadStatus] = useState("connecting");
  // How far the switcher just travelled, so the panel slides in from the side
  // you came from over the same time as the highlight.
  const [slide, setSlide] = useState(null);
  const appRef = useRef(null);
  appRef.current = app;
  usePcVolumeKeys();

  const appIndex = (id) => SWITCHER_APPS.findIndex((a) => a.id === id);

  // Move to an app and remember which way the switcher went.
  const goTo = (next) => {
    const steps = appIndex(next) - appIndex(appRef.current);
    setSlide(appRef.current && Number.isFinite(steps) ? steps || null : null);
    setApp(next);
  };

  // The full laptop page uses the laptop theme; otherwise the app's.
  const themeApp = laptop === "full" ? "laptop" : app;
  useEffect(() => {
    if (!themeApp) return;
    document.body.dataset.app = themeApp;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[themeApp]);
  }, [themeApp]);

  // Keep power / theme in step with the backend (another phone may change it).
  // Also follows the last app (another phone may have switched apps).
  const apply = useCallback((m) => {
    setRemote(m);
    if (m?.lastApp && WEB_APPS.has(m.lastApp) && Date.now() - pickedAt.current > PICK_HOLD_MS) {
      if (m.lastApp !== appRef.current) goTo(m.lastApp);
    }
    return m;
    // goTo only reads refs, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await getMode());
    } catch {}
  }, [apply]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (fn, optimistic) => {
    if (optimistic) setRemote((r) => ({ ...r, ...optimistic }));
    setBusy(true);
    try {
      apply(await fn());
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const choose = (next) => {
    goTo(next);
    pickedAt.current = Date.now();
    setRemote((r) => ({ ...r, lastApp: next }));
    // Picking a web app switches Chrome to its tab; the backend remembers it
    // as the last app.
    if (WEB_APPS.has(next)) showApp(next).catch(() => {});
  };

  const powerOff = () => {
    buzz();
    run(() => setPower(false), { power: "off" });
  };

  // The backend opens its last app's tab in Chrome; this phone shows that
  // app's remote.
  const powerOn = () => {
    setStandby(false);
    setSlide(null);
    if (remote.lastApp) setApp(remote.lastApp);
    run(() => setPower(true), { power: "on" });
  };

  if (standby || remote.power === "off" || !app) {
    return (
      <main className="remote">
        <PowerScreen
          mode={remote.mode}
          tvMode={remote.tvMode}
          pcOn={remote.power === "on"}
          lastApp={remote.lastApp}
          nowPlaying={remote.nowPlaying}
          busy={busy}
          onPowerOn={powerOn}
          onTheme={(mode) => run(() => setMode(mode), { mode })}
          onFullscreen={() => run(toggleTv)}
        />
      </main>
    );
  }

  if (laptop === "full") {
    return (
      <main className="remote">
        <header className="topbar page-head">
          <button type="button" className="back-btn" onClick={() => setLaptop(null)}>
            <FontAwesomeIcon icon={faArrowLeft} />
            Back
          </button>
          <div className="page-title">
            <h1>Laptop Control</h1>
            <TrackpadStatus status={padStatus} />
          </div>
        </header>
        <LaptopPanel variant="full" onStatus={setPadStatus} />
      </main>
    );
  }

  // A panel that follows the switcher slides in sideways; anything else
  // (power on, first load) keeps the gentle lift.
  const panelMotion = slide
    ? { "--panel-x": slide > 0 ? "100%" : "-100%", "--panel-y": "0px", "--panel-ms": `${slideMs(slide)}ms` }
    : undefined;

  return (
    <main className="remote" style={panelMotion}>
      <header className="topbar">
        <div className="topbar-inner">
          {app && <AppSwitcher app={app} onChange={choose} />}
          <button type="button" className="power-btn" aria-label="Turn the remote off" onClick={powerOff}>
            <FontAwesomeIcon icon={faPowerOff} />
          </button>
        </div>
      </header>

      <div key={app} className="app-stage">
        {app === "youtube" && <YouTubePanel />}
        {app === "prime" && <PrimePanel />}
        {app === "netflix" && <NetflixPanel />}
        {app === "jellyfin" && <JellyfinPanel />}
      </div>

      {laptop === "drawer" && (
        <LaptopDrawer closeSignal={drawerClose} onClose={() => setLaptop(null)} onMore={() => setLaptop("full")} />
      )}
      <LaptopBubble
        active={laptop === "drawer"}
        onTap={() => (laptop === "drawer" ? setDrawerClose((n) => n + 1) : setLaptop("drawer"))}
      />
    </main>
  );
}
