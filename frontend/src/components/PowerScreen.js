"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompress, faExpand, faMoon, faPowerOff, faSun, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

const THEMES = [
  { id: "day", label: "Light", icon: faSun, desc: "Bright and clean" },
  { id: "night", label: "Dark", icon: faMoon, desc: "Dim, for a dark room" },
  { id: "live", label: "Live", icon: faWandMagicSparkles, desc: "Slow colour drift" },
];

// What the phone shows while the remote is powered off: just the power
// button, the QR screen's theme, and fullscreen for the QR screen.
export default function PowerScreen({ mode, tvMode, busy, onPowerOn, onTheme, onFullscreen }) {
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
        <h1>Remote is off</h1>
        <p>Playback is paused and the PC is showing the QR screen. Tap to turn on.</p>
      </div>

      <div className="power-section">
        <span className="eyebrow">QR screen</span>
        <div className="theme-cards" role="radiogroup" aria-label="QR screen theme">
          {THEMES.map((t) => (
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
              <span className="theme-swatch">
                <FontAwesomeIcon icon={t.icon} />
              </span>
              <span className="theme-label">{t.label}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`power-fullscreen${tvMode ? " on" : ""}`}
          onClick={() => {
            buzz();
            onFullscreen();
          }}
        >
          <FontAwesomeIcon icon={tvMode ? faCompress : faExpand} />
          {tvMode ? "Exit fullscreen" : "Fullscreen on the PC"}
        </button>
      </div>
    </section>
  );
}
