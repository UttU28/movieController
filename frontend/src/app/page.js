"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { APPS as SWITCHER_APPS, slideMs } from "../components/AppSwitcher";
import LaptopBubble from "../components/LaptopBubble";
import LaptopDrawer from "../components/LaptopDrawer";
import PowerScreen from "../components/PowerScreen";
import { buzz } from "../components/RemoteButton";
import { getMode, setMode, setPower, showApp, toggleTv } from "../lib/api";
import { isDev, setDev, watchDev } from "../lib/devMode";
import { getStyle, setStyle, watchStyle } from "../lib/remoteStyle";
import { RemoteAppProvider } from "../lib/RemoteAppContext";
import usePcVolumeKeys from "../lib/usePcVolumeKeys";
import useRemote from "../lib/useRemote";
import JellyfinPanel from "../panels/JellyfinPanel";
import LaptopPanel, { TrackpadStatus } from "../panels/LaptopPanel";
import NetflixPanel from "../panels/NetflixPanel";
import PrimePanel from "../panels/PrimePanel";
import SimpleRemote from "../panels/SimpleRemote";
import VikiPanel from "../panels/VikiPanel";
import YouTubePanel from "../panels/YouTubePanel";

const WEB_APPS = new Set(["youtube", "prime", "netflix", "viki", "jellyfin"]);
const THEME_COLORS = { laptop: "#0d0e12", youtube: "#0f0f0f", prime: "#0b1219", netflix: "#141414", viki: "#0c1018", jellyfin: "#0e1116" };
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
  // Developer mode (saved on the phone): no backend calls, tabs unlock.
  const [dev, setDevOn] = useState(false);
  useEffect(() => {
    setDevOn(isDev());
    return watchDev(setDevOn);
  }, []);
  // Remote layout, chosen on the power screen and saved on the phone.
  const [style, setStyleOn] = useState("full");
  useEffect(() => {
    setStyleOn(getStyle());
    return watchStyle(setStyleOn);
  }, []);
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
  // One app remote, shared (via context) with the header preview, the panels
  // or simple remote, and the bubble's extra buttons.
  const appRemote = useRemote(app);

  const appName = SWITCHER_APPS.find((a) => a.id === app)?.label || "Remote";

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
    if (isDev()) return; // developer mode: the backend's state is not followed
    try {
      apply(await getMode());
    } catch {}
  }, [apply]);

  useEffect(() => {
    if (isDev()) return undefined; // developer mode: no polling
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, dev]);

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
    // as the last app. Developer mode just changes the screen.
    if (!dev && WEB_APPS.has(next)) showApp(next).catch(() => {});
  };

  const powerOff = () => {
    buzz();
    if (dev) {
      setStandby(true);
      return;
    }
    run(() => setPower(false), { power: "off" });
  };

  // The backend opens its last app's tab in Chrome; this phone shows that
  // app's remote.
  const powerOn = () => {
    setStandby(false);
    setSlide(null);
    if (remote.lastApp) setApp(remote.lastApp);
    else if (dev) setApp(SWITCHER_APPS[0].id); // dev: open on the first app
    if (dev) return;
    run(() => setPower(true), { power: "on" });
  };

  // Developer mode switches freely from the power screen: turning it on
  // unlocks the remote right away; turning it off hands control back to the
  // backend, which may power the remote back down.
  const toggleDev = () => {
    buzz();
    const next = !dev;
    setDev(next);
    if (next) {
      setStandby(false);
      setSlide(null);
      setApp((a) => a || (WEB_APPS.has(remote.lastApp) ? remote.lastApp : SWITCHER_APPS[0].id));
    } else {
      setStandby(true);
      refresh();
    }
  };

  // The backend keeps the phone on the power screen while the remote is off;
  // developer mode ignores that lock.
  if (standby || (!dev && remote.power === "off") || !app) {
    return (
      <main className="remote">
        <PowerScreen
          mode={remote.mode}
          tvMode={remote.tvMode}
          pcOn={dev || remote.power === "on"}
          lastApp={remote.lastApp}
          nowPlaying={remote.nowPlaying}
          busy={busy}
          dev={dev}
          style={style}
          onStyle={setStyle}
          onPowerOn={powerOn}
          onDev={toggleDev}
          onTheme={(mode) => (dev ? setRemote((r) => ({ ...r, mode })) : run(() => setMode(mode), { mode }))}
          onFullscreen={() => (dev ? setRemote((r) => ({ ...r, tvMode: !r.tvMode })) : run(toggleTv))}
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
    <RemoteAppProvider value={appRemote}>
      <main className="remote" style={panelMotion}>
        {/* No top bar at all: the bubble on the side carries the tabs,
            power and everything else, in both styles. */}
        <div key={app} className="app-stage">
          {style === "simple" ? (
            <SimpleRemote app={app} appName={appName} />
          ) : (
            <>
              {app === "youtube" && <YouTubePanel />}
              {app === "prime" && <PrimePanel />}
              {app === "netflix" && <NetflixPanel />}
              {app === "viki" && <VikiPanel />}
              {app === "jellyfin" && <JellyfinPanel />}
            </>
          )}
        </div>

        {laptop === "drawer" && (
          <LaptopDrawer
            app={app}
            style={style}
            onChoose={choose}
            onPowerOff={() => {
              setLaptop(null);
              powerOff();
            }}
            closeSignal={drawerClose}
            onClose={() => setLaptop(null)}
            onMore={() => setLaptop("full")}
          />
        )}
        <LaptopBubble
          active={laptop === "drawer"}
          onTap={() => (laptop === "drawer" ? setDrawerClose((n) => n + 1) : setLaptop("drawer"))}
        />
      </main>
    </RemoteAppProvider>
  );
}
