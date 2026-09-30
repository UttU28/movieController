"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPowerOff } from "@fortawesome/free-solid-svg-icons";
import AppSwitcher, { APPS } from "../components/AppSwitcher";
import ModePicker from "../components/ModePicker";
import { showApp } from "../lib/api";
import usePcVolumeKeys from "../lib/usePcVolumeKeys";
import JellyfinPanel from "../panels/JellyfinPanel";
import LaptopPanel from "../panels/LaptopPanel";
import NetflixPanel from "../panels/NetflixPanel";
import NoiseCanvas from "../components/NoiseCanvas";
import PrimePanel from "../panels/PrimePanel";
import YouTubePanel from "../panels/YouTubePanel";

const APP_KEY = "remote.app";
const MODE_KEY = "remote.mode";
const WEB_APPS = new Set(["youtube", "prime", "netflix", "jellyfin"]);
const THEME_COLORS = { laptop: "#0d0e12", youtube: "#0f0f0f", prime: "#0b1219", netflix: "#141414", jellyfin: "#0e1116" };
const MODE_THEMES = { day: "#0f0f0f", night: "#000000", live: "#0a0a0a" };

export default function Home() {
  const [app, setApp] = useState(null);
  const [mode, setModeState] = useState("day");
  const [showPicker, setShowPicker] = useState(false);
  usePcVolumeKeys();

  // Restore the last app and mode on mount (without switching Chrome's tab).
  useEffect(() => {
    let savedApp = null;
    let savedMode = null;
    try { savedApp = localStorage.getItem(APP_KEY); } catch {}
    try { savedMode = localStorage.getItem(MODE_KEY); } catch {}
    const appOk = APPS.some((a) => a.id === savedApp);
    const modeOk = ["day", "night", "live"].includes(savedMode);
    if (appOk) setApp(savedApp);
    else setApp("laptop");
    if (modeOk) {
      setModeState(savedMode);
      document.body.dataset.mode = savedMode;
      document.title = savedMode === "night" ? "Remote — Night" : savedMode === "live" ? "Remote — Live" : "Remote";
    }
  }, []);

  useEffect(() => {
    if (!app) return;
    document.body.dataset.app = app;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[app]);
  }, [app]);

  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    document.body.dataset.mode = mode;
    document.title = mode === "night" ? "Remote — Night" : mode === "live" ? "Remote — Live" : "Remote";
    if (mode === "night" || mode === "live") {
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", MODE_THEMES[mode]);
    }
  }, [mode]);

  const choose = (next) => {
    setApp(next);
    try { localStorage.setItem(APP_KEY, next); } catch {}
    if (WEB_APPS.has(next)) showApp(next).catch(() => {});
  };

  const togglePicker = () => setShowPicker((p) => !p);

  // Live mode: render the noise canvas behind everything.
  const liveBg = mode === "live" && <NoiseCanvas />;

  return (
    <>
      {liveBg}
      <main className="remote">
        <header className="topbar">
          {showPicker ? (
            <ModePicker onBack={() => setShowPicker(false)} />
          ) : (
            <div className="topbar-inner">
              {app !== null && <AppSwitcher app={app} onChange={choose} />}
              <button type="button" className="power-btn" aria-label="Power" onClick={togglePicker}>
                <FontAwesomeIcon icon={faPowerOff} />
              </button>
            </div>
          )}
        </header>

        {app === "laptop" && <LaptopPanel />}
        {app === "youtube" && <YouTubePanel />}
        {app === "prime" && <PrimePanel />}
        {app === "netflix" && <NetflixPanel />}
        {app === "jellyfin" && <JellyfinPanel />}
      </main>
    </>
  );
}
