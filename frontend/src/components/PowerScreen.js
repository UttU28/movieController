"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCheck, faChevronDown, faChevronUp, faCompress, faExpand, faImages, faPalette, faPlus, faPowerOff, faRotate, faXmark } from "@fortawesome/free-solid-svg-icons";
import { addWallpaper, errorMessage, getWallpapers, reloadQr, removeWallpaper, selectWallpaper } from "../lib/api";
import { MarqueeTitle } from "./NowShowing";
import { buzz } from "./RemoteButton";

// Where to find wallpapers: copy a wallpaper's page link and paste it below.
const WALLPAPER_SITES = [
  { label: "wallspace", url: "https://wallspace.app/" },
  { label: "wallper", url: "https://www.wallper.app/" },
];

// The whole Home screen choice: two modes, nothing else. Dark shows just the
// wallpaper, dimmed; Live shows it with the clock and QR at full brightness.
const THEMES = [
  { id: "night", label: "Dark mode", desc: "Just the wallpaper, dimmed for the dark" },
  { id: "live", label: "Live mode", desc: "Wallpaper, clock and QR at full brightness" },
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

// What the phone shows while the remote is powered off: a short status,
// the last title and app, and Turn on. The Home screen editor stays behind Theme.
const APP_NAMES = { youtube: "YouTube", prime: "Prime Video", netflix: "Netflix", viki: "Viki", jellyfin: "Jellyfin" };

function ToolButton({ icon, label, active = false, disabled = false, spin = false, pressed, expanded, onPress }) {
  return (
    <button
      type="button"
      className={`rbtn${active ? " active" : ""}`}
      disabled={disabled}
      aria-pressed={pressed}
      aria-expanded={expanded}
      onClick={() => {
        buzz();
        onPress();
      }}
    >
      <FontAwesomeIcon icon={icon} spin={spin} />
      <span>{label}</span>
    </button>
  );
}

export default function PowerScreen({ mode, tvMode, busy, pcOn, lastApp, nowPlaying, onPowerOn, onTheme, onFullscreen }) {
  const appName = APP_NAMES[lastApp];
  const papers = useWallpapers();
  const [link, setLink] = useState("");
  const [reloading, setReloading] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  // Wallpaper picking hides behind one row, so the panel shows only the
  // two modes unless it's opened.
  const [papersOpen, setPapersOpen] = useState(false);
  const items = papers.data?.items || [];
  const selected = papers.data?.selected || {};
  const posterFor = (themeId) => items.find((i) => i.id === selected[themeId])?.poster;
  const title = (nowPlaying || "").trim();
  const sub = pcOn ? "Turn on to open the remote." : "Playback is paused.";

  const closeThemes = () => setThemesOpen(false);

  return (
    <section className={`power-layout${themesOpen ? " themes-open" : ""}`}>
      <div className="power-slot" inert={themesOpen}>
        <div className="power-chrome-top">
          <section className="card titlebar">
            <div className="titlebar-row">
              <div className="titlebar-text">
                <span className="eyebrow">
                  <i className={`power-dot${pcOn ? " on" : ""}`} aria-hidden="true" />
                  {pcOn ? "Ready" : "Standby"}
                </span>
                <div className="player-title">{pcOn ? "Remote is ready" : "Remote is off"}</div>
                <div className="selected-sub">{sub}</div>
              </div>
            </div>
          </section>

          {(title || appName) && (
            <section className="card titlebar">
              <div className="titlebar-row">
                <div className="titlebar-text">
                  <span className="eyebrow">Last playing</span>
                  <MarqueeTitle text={title || appName} />
                  {title && appName ? <div className="selected-sub">{appName}</div> : null}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="power-scroll">
        {themesOpen && (
        <div className="power-theme">
          <div className="theme-head">
            <span className="eyebrow">Home screen</span>
            <button
              type="button"
              className="theme-close"
              aria-label="Close"
              onClick={() => {
                buzz();
                closeThemes();
              }}
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
      <div className="power-section">
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
                <span className="theme-swatch" style={poster ? { backgroundImage: `url("${poster}")` } : undefined}>
                  {mode === t.id && (
                    <span className="theme-check">
                      <FontAwesomeIcon icon={faCheck} />
                    </span>
                  )}
                </span>
                <span className="theme-label">{t.label}</span>
                <span className="theme-desc">{t.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="papers-toggle"
        aria-expanded={papersOpen}
        onClick={() => {
          buzz();
          setPapersOpen((open) => !open);
        }}
      >
        <FontAwesomeIcon icon={faImages} />
        <span>Wallpapers</span>
        <span className="papers-sub">{items.length ? `${items.length} saved` : "none yet"}</span>
        <span className="papers-caret">
          <FontAwesomeIcon icon={papersOpen ? faChevronUp : faChevronDown} />
        </span>
      </button>

      {papersOpen && (
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
      )}
        </div>
        )}
      </div>

      <div className="row three">
        <ToolButton
          icon={faRotate}
          label="Reload"
          spin={reloading}
          disabled={reloading}
          onPress={async () => {
            setReloading(true);
            try {
              await reloadQr();
            } catch {
              // The Home screen stays as it is; the button just stops spinning.
            } finally {
              setReloading(false);
            }
          }}
        />
        <ToolButton
          icon={faPalette}
          label="Theme"
          active={themesOpen}
          expanded={themesOpen}
          onPress={() => setThemesOpen((open) => !open)}
        />
        <ToolButton
          icon={tvMode ? faCompress : faExpand}
          label="Full"
          active={!!tvMode}
          pressed={!!tvMode}
          onPress={onFullscreen}
        />
      </div>

      <div className="power-slot bottom" inert={themesOpen}>
        <div className="power-chrome-bottom">
      <div className="dock power-dock">
        <button
          type="button"
          className="power-go"
          aria-label="Turn the remote on"
          disabled={busy}
          onClick={() => {
            buzz();
            onPowerOn();
          }}
        >
          <span className="dock-btn main">
            <FontAwesomeIcon icon={faPowerOff} />
          </span>
          <span className="power-dock-label">Turn on</span>
        </button>
      </div>
        </div>
      </div>
    </section>
  );
}
