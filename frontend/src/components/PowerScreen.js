"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCheck, faCompress, faExpand, faPalette, faPlus, faPowerOff, faRotate, faXmark } from "@fortawesome/free-solid-svg-icons";
import { addWallpaper, errorMessage, getWallpapers, reloadQr, removeWallpaper, selectWallpaper } from "../lib/api";
import { buzz } from "./RemoteButton";

// Where to find wallpapers: copy a wallpaper's page link and paste it below.
const WALLPAPER_SITES = [
  { label: "wallspace", url: "https://wallspace.app/" },
  { label: "wallper", url: "https://www.wallper.app/" },
];

const THEMES = [
  { id: "night", label: "Dark", desc: "Dimmed, for a dark room" },
  { id: "live", label: "Live", desc: "Full-brightness wallpaper" },
];

function useWallpapers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getWallpapers());
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setError("");
    try {
      setData(await fn());
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  return {
    data,
    error,
    adding,
    select: (id) => run(() => selectWallpaper(id, "live")),
    remove: (id) => run(() => removeWallpaper(id)),
    add: async (url) => {
      setAdding(true);
      const ok = await run(() => addWallpaper(url, "live"));
      setAdding(false);
      return ok;
    },
  };
}

// What the phone shows while the remote is powered off: the power button,
// the Home screen's theme (Dark / Live), the Live wallpaper collection, and
// fullscreen for the Home screen.
const APP_NAMES = { youtube: "YouTube", prime: "Prime Video", netflix: "Netflix", jellyfin: "Jellyfin" };

export default function PowerScreen({ mode, tvMode, busy, pcOn, lastApp, onPowerOn, onTheme, onFullscreen }) {
  const appName = APP_NAMES[lastApp];
  const papers = useWallpapers();
  const [link, setLink] = useState("");
  const [reloading, setReloading] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const items = papers.data?.items || [];
  const selected = papers.data?.selected || {};
  const posterFor = (themeId) => items.find((i) => i.id === selected[themeId])?.poster;

  return (
    <section className="power-screen">
      <button
        type="button"
        className="power-big"
        aria-label="Turn the remote on"
        disabled={busy}
        onClick={() => {
          buzz();
          onPowerOn();
        }}
      >
        <FontAwesomeIcon icon={faPowerOff} />
      </button>
      <div className="power-text">
        <h1>{pcOn ? "Remote is ready" : "Remote is off"}</h1>
        <p>
          {pcOn
            ? `The PC is on ${appName || "an app"}. Tap to open its remote.`
            : `Playback is paused and the PC is showing the Home screen. Tap to turn on${appName ? ` and go back to ${appName}` : ""}.`}
        </p>
      </div>

      <div className="power-tools">
        <button
          type="button"
          className="pill-btn power-tool"
          aria-label="Reload the Home screen"
          disabled={reloading}
          onClick={async () => {
            buzz();
            setReloading(true);
            try {
              await reloadQr();
            } catch {
              // The QR tab stays as it is; the button just stops spinning.
            } finally {
              setReloading(false);
            }
          }}
        >
          <FontAwesomeIcon icon={faRotate} spin={reloading} />
        </button>
        <button
          type="button"
          className={`pill-btn power-tool${themesOpen ? " on" : ""}`}
          aria-label="Theme"
          aria-expanded={themesOpen}
          onClick={() => {
            buzz();
            setThemesOpen((open) => !open);
          }}
        >
          <FontAwesomeIcon icon={faPalette} />
        </button>
        <button
          type="button"
          className={`pill-btn power-tool${tvMode ? " on" : ""}`}
          aria-label={tvMode ? "Exit fullscreen" : "Fullscreen"}
          aria-pressed={!!tvMode}
          onClick={() => {
            buzz();
            onFullscreen();
          }}
        >
          <FontAwesomeIcon icon={tvMode ? faCompress : faExpand} />
        </button>
      </div>

      {themesOpen && (
      <>
      <div className="power-section">
        <span className="eyebrow">Home screen</span>
        <div className="theme-cards two" role="radiogroup" aria-label="Home screen theme">
          {THEMES.map((t) => {
            const poster = posterFor(t.id);
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={mode === t.id}
                className={`theme-card theme-${t.id}${mode === t.id ? " on" : ""}`}
                onClick={() => {
                  buzz();
                  onTheme(t.id);
                }}
              >
                <span className="theme-swatch" style={poster ? { backgroundImage: `url("${poster}")` } : undefined} />
                <span className="theme-label">{t.label}</span>
                <span className="theme-desc">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="power-section">
        <div className="wall-head">
          <span className="eyebrow">Live wallpaper</span>
          <span className="wall-sites">
            {WALLPAPER_SITES.map((site) => (
              <a key={site.url} className="pill-btn" href={site.url} target="_blank" rel="noreferrer">
                {site.label} <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </a>
            ))}
          </span>
        </div>
        <div className="wall-grid">
          {items.map((w) => {
            const on = selected.live === w.id;
            return (
              <div key={w.id} className={`wall-card${on ? " on" : ""}`}>
                <button
                  type="button"
                  className="wall-pick"
                  aria-pressed={on}
                  onClick={() => {
                    buzz();
                    papers.select(w.id);
                    if (mode !== "live") onTheme("live");
                  }}
                >
                  <span className="wall-thumb" style={w.poster ? { backgroundImage: `url("${w.poster}")` } : undefined}>
                    {on && (
                      <span className="wall-check">
                        <FontAwesomeIcon icon={faCheck} />
                      </span>
                    )}
                  </span>
                  <span className="wall-title">{w.title}</span>
                </button>
                {items.length > 1 && (
                  <button
                    type="button"
                    className="wall-remove"
                    aria-label={`Remove ${w.title}`}
                    onClick={() => {
                      buzz();
                      papers.remove(w.id);
                    }}
                  >
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <form
          className="search wall-add"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!link.trim()) return;
            buzz();
            if (await papers.add(link.trim())) {
              setLink("");
              if (mode !== "live") onTheme("live");
            }
          }}
        >
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="Paste a wallspace or wallper link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button type="submit" className="send-btn" aria-label="Add wallpaper" disabled={papers.adding}>
            {papers.adding ? "…" : <FontAwesomeIcon icon={faPlus} />}
          </button>
        </form>
        {papers.error && <div className="error">{papers.error}</div>}
      </div>
      </>
      )}
    </section>
  );
}
