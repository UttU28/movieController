"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPowerOff } from "@fortawesome/free-solid-svg-icons";
import AppSwitcher, { APPS } from "../components/AppSwitcher";
import PowerScreen from "../components/PowerScreen";
import { buzz } from "../components/RemoteButton";
import { getMode, setMode, setPower, showApp, toggleTv } from "../lib/api";
import usePcVolumeKeys from "../lib/usePcVolumeKeys";
import JellyfinPanel from "../panels/JellyfinPanel";
import LaptopPanel from "../panels/LaptopPanel";
import NetflixPanel from "../panels/NetflixPanel";
import PrimePanel from "../panels/PrimePanel";
import YouTubePanel from "../panels/YouTubePanel";

const APP_KEY = "remote.app";
const WEB_APPS = new Set(["youtube", "prime", "netflix", "jellyfin"]);
const THEME_COLORS = { laptop: "#0d0e12", youtube: "#0f0f0f", prime: "#0b1219", netflix: "#141414", jellyfin: "#0e1116" };
const POLL_MS = 4000;

export default function Home() {
  const [app, setApp] = useState(null);
  // Shared with the backend (and every other phone): power + QR theme.
  const [remote, setRemote] = useState({ power: "on", mode: "day", tvMode: false });
  const [busy, setBusy] = useState(false);
  usePcVolumeKeys();

  // Restore the last app, without switching Chrome's tab on page load.
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem(APP_KEY);
    } catch {}
    setApp(APPS.some((a) => a.id === saved) ? saved : "laptop");
  }, []);

  useEffect(() => {
    if (!app) return;
    document.body.dataset.app = app;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[app]);
  }, [app]);

  // Keep power / theme in step with the backend (another phone may change it).
  const refresh = useCallback(async () => {
    try {
      setRemote(await getMode());
    } catch {}
  }, []);

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
      setRemote(await fn());
    } catch {
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const choose = (next) => {
    setApp(next);
    try {
      localStorage.setItem(APP_KEY, next);
    } catch {}
    // Picking a web app also switches Chrome to its tab.
    if (WEB_APPS.has(next)) showApp(next).catch(() => {});
  };

  const powerOff = () => {
    buzz();
    run(() => setPower(false), { power: "off" });
  };

  if (remote.power === "off") {
    return (
      <main className="remote">
        <PowerScreen
          mode={remote.mode}
          tvMode={remote.tvMode}
          busy={busy}
          onPowerOn={() => run(() => setPower(true), { power: "on" })}
          onTheme={(mode) => run(() => setMode(mode), { mode })}
          onFullscreen={() => run(toggleTv)}
        />
      </main>
    );
  }

  return (
    <main className="remote">
      <header className="topbar">
        <div className="topbar-inner">
          {app && <AppSwitcher app={app} onChange={choose} />}
          <button type="button" className="power-btn" aria-label="Turn the remote off" onClick={powerOff}>
            <FontAwesomeIcon icon={faPowerOff} />
          </button>
        </div>
      </header>

      {app === "laptop" && <LaptopPanel />}
      {app === "youtube" && <YouTubePanel />}
      {app === "prime" && <PrimePanel />}
      {app === "netflix" && <NetflixPanel />}
      {app === "jellyfin" && <JellyfinPanel />}
    </main>
  );
}
