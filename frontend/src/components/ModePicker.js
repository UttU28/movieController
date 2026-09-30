"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBroadcastTower, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import { pauseAll, setMode } from "../lib/api";
import { buzz } from "./RemoteButton";

const MODES = [
  { id: "day", label: "Day", icon: faSun, desc: "Normal remote" },
  { id: "night", label: "Night", icon: faMoon, desc: "Dark room · QR code" },
  { id: "live", label: "Live", icon: faBroadcastTower, desc: "Animated wallpaper" },
];

export default function ModePicker({ onBack }) {
  // When a mode is selected: pause all playback, open QR tab in Chrome,
  // save mode locally, then let the page re-render with the new mode.
  const select = async (mode) => {
    buzz();
    try {
      // Pause all tabs first, then switch to QR.
      await pauseAll();
      await setMode(mode);
      // Apply mode immediately for instant feedback.
      localStorage.setItem("remote.mode", mode);
      document.body.dataset.mode = mode;
      document.title = mode === "night" ? "Remote — Night" : mode === "live" ? "Remote — Live" : "Remote";
    } catch {
      // Silently continue — mode is still stored locally.
    }
  };

  return (
    <div className="mode-picker">
      <div className="mode-picker-row">
        {MODES.map((m) => (
          <button key={m.id} type="button" className="mode-card" onClick={() => select(m.id)}>
            <FontAwesomeIcon icon={m.icon} />
            <span className="mode-label">{m.label}</span>
            <span className="mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
      <button type="button" className="mode-back" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
