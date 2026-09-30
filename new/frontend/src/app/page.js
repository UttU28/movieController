"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import AppSwitcher, { APPS } from "../components/AppSwitcher";
import { showApp } from "../lib/api";
import LaptopPanel from "../panels/LaptopPanel";
import NetflixPanel from "../panels/NetflixPanel";
import PrimePanel from "../panels/PrimePanel";
import YouTubePanel from "../panels/YouTubePanel";

const APP_KEY = "remote.app";
const WEB_APPS = new Set(["youtube", "prime", "netflix"]);
const THEME_COLORS = { laptop: "#0d0e12", youtube: "#0f0f0f", prime: "#0b1219", netflix: "#141414" };

export default function Home() {
  const [app, setApp] = useState(null);

  // Restore the last app, without switching Chrome's tab on page load.
  useEffect(() => {
    let saved = null;
    try {
      saved = localStorage.getItem(APP_KEY);
    } catch {}
    setApp(APPS.some((a) => a.id === saved) ? saved : "youtube");
  }, []);

  useEffect(() => {
    if (!app) return;
    document.body.dataset.app = app;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[app]);
  }, [app]);

  const choose = (next) => {
    setApp(next);
    try {
      localStorage.setItem(APP_KEY, next);
    } catch {}
    // Picking a web app also switches Chrome to its tab.
    if (WEB_APPS.has(next)) showApp(next).catch(() => {});
  };

  const current = APPS.find((a) => a.id === app);

  return (
    <main className="remote">
      <header className="topbar">
        <div className="brand">
          {current && <FontAwesomeIcon icon={current.icon} className="brand-icon" />}
          <span>{current ? `${current.label} Remote` : "Remote"}</span>
        </div>
        {app && <AppSwitcher app={app} onChange={choose} />}
      </header>

      {app === "laptop" && <LaptopPanel />}
      {app === "youtube" && <YouTubePanel />}
      {app === "prime" && <PrimePanel />}
      {app === "netflix" && <NetflixPanel />}
    </main>
  );
}
