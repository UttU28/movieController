"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPause, faPlay, faRotateLeft, faRotateRight, faVolumeHigh, faVolumeLow } from "@fortawesome/free-solid-svg-icons";
import useRemote from "../lib/useRemote";
import { buzz } from "./RemoteButton";

function DockButton({ icon, label, onPress, main = false, tag }) {
  return (
    <button
      type="button"
      className={`dock-btn${main ? " main" : ""}`}
      aria-label={label}
      onClick={() => {
        buzz();
        onPress();
      }}
    >
      <FontAwesomeIcon icon={icon} />
      {tag && <span className="dock-tag">{tag}</span>}
    </button>
  );
}

// Playback bar pinned to the bottom: laptop volume on the outer edges,
// seek either side of a big Play/Pause.
export default function PlayerDock({ player, action }) {
  const pc = useRemote("laptop", { poll: false });
  const playing = player && !player.paused;

  return (
    <div className="dock">
      <DockButton icon={faVolumeLow} label="PC volume down" tag="PC" onPress={() => pc.action("volumeDown")} />
      <DockButton icon={faRotateLeft} label="Back 10 seconds" tag="10" onPress={() => action("seekBack")} />
      <DockButton
        icon={playing ? faPause : faPlay}
        label={playing ? "Pause" : "Play"}
        main
        onPress={() => { action("playPause"); pc.action("mediaPlayPause"); }}
      />
      <DockButton icon={faRotateRight} label="Forward 10 seconds" tag="10" onPress={() => action("seekForward")} />
      <DockButton icon={faVolumeHigh} label="PC volume up" tag="PC" onPress={() => pc.action("volumeUp")} />
    </div>
  );
}
