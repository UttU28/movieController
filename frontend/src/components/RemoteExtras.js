"use client";

import {
  faArrowLeft,
  faBackwardStep,
  faBars,
  faClosedCaptioning,
  faExpand,
  faForwardStep,
  faGauge,
  faHouse,
  faInfo,
  faLocationCrosshairs,
  faRotate,
  faTv,
  faVolumeHigh,
  faVolumeLow,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import { AUDIO_LABELS, SECTIONS } from "../lib/appMeta";
import { useAppRemote } from "../lib/RemoteAppContext";
import useRemote from "../lib/useRemote";
import RemoteButton from "./RemoteButton";
import { DRAWER_SHORTCUTS, HOTKEYS, KEYS } from "../panels/LaptopPanel";

// The media buttons the simple remote keeps off its main screen, plus the
// quick laptop Keys/Shortcuts rows — everything the bubble hub offers in
// simple mode. "More" still opens the complete laptop page.
export default function RemoteExtras({ app }) {
  const { state, action } = useAppRemote();
  const pc = useRemote("laptop", { poll: false });
  const audio = AUDIO_LABELS[app] || "";
  const fullscreen = app === "youtube" ? !!state?.fullscreen : !!state?.player?.fullscreen;

  const mediaRows = [];
  if (app === "youtube") {
    mediaRows.push([
      { icon: faArrowLeft, label: "Back", fn: () => action("back") },
      { icon: faHouse, label: "Home", fn: () => action("home") },
      { icon: faLocationCrosshairs, label: "Focus", fn: () => action("focus") },
      { icon: faInfo, label: "Mini", fn: () => action("miniplayer") },
      { icon: faRotate, label: "Reload", fn: () => action("reload") },
    ]);
    mediaRows.push([
      { icon: faVolumeLow, label: `${audio} -`, fn: () => action("volumeDown") },
      { icon: faVolumeHigh, label: `${audio} +`, fn: () => action("volumeUp") },
      { icon: faClosedCaptioning, label: "CC", fn: () => action("captions") },
      { icon: faGauge, label: state?.player ? `${state.player.rate}x` : "Speed", fn: () => action("speed") },
      { icon: faExpand, label: "Full", active: fullscreen, fn: () => action("fullscreen") },
    ]);
    mediaRows.push([
      { icon: faTv, label: "TV", active: !!state?.tvMode, fn: () => action("tvMode") },
      { icon: faForwardStep, label: "Next", fn: () => action("next") },
      { icon: faVolumeXmark, label: "PC Mute", fn: () => pc.action("mute") },
    ]);
  } else if (app === "jellyfin") {
    mediaRows.push([
      { icon: faArrowLeft, label: "Back", fn: () => action("back") },
      { icon: faHouse, label: "Home", fn: () => action("home") },
      { icon: faLocationCrosshairs, label: "Focus", fn: () => action("focus") },
      { icon: faBars, label: "Menu", fn: () => action("menu") },
    ]);
    mediaRows.push([
      { icon: faVolumeLow, label: `${audio} -`, fn: () => action("volumeDown") },
      { icon: faVolumeHigh, label: `${audio} +`, fn: () => action("volumeUp") },
      { icon: faRotate, label: "Reload", fn: () => action("reload") },
      { icon: faExpand, label: "Full", active: fullscreen, fn: () => action("fullscreen") },
    ]);
    mediaRows.push([
      { icon: faBackwardStep, label: "Prev", fn: () => action("previous") },
      { icon: faForwardStep, label: "Next", fn: () => action("next") },
      { icon: faTv, label: "TV", active: !!state?.tvMode, fn: () => action("tvMode") },
      { icon: faVolumeXmark, label: "PC Mute", fn: () => pc.action("mute") },
    ]);
  } else {
    // Prime Video / Netflix / Viki
    mediaRows.push([
      { icon: faArrowLeft, label: "Back", fn: () => action("back") },
      { icon: faHouse, label: "Home", fn: () => action("section", { value: "home" }) },
      { icon: faLocationCrosshairs, label: "Focus", fn: () => action("focus") },
      ...(SECTIONS[app] || []).map((s) => ({ icon: s.icon, label: s.label, fn: () => action("section", { value: s.value }) })),
    ]);
    mediaRows.push([
      { icon: faVolumeLow, label: `${audio} -`, fn: () => action("volumeDown") },
      { icon: faVolumeHigh, label: `${audio} +`, fn: () => action("volumeUp") },
      { icon: faClosedCaptioning, label: "Subtitles", fn: () => action("subtitles") },
      { icon: faExpand, label: "Full", active: fullscreen, fn: () => action("fullscreen") },
      { icon: faRotate, label: "Reload", fn: () => action("reload") },
    ]);
    mediaRows.push([
      { icon: faTv, label: "TV", active: !!state?.tvMode, fn: () => action("tvMode") },
      { icon: faVolumeXmark, label: "PC Mute", fn: () => pc.action("mute") },
    ]);
  }

  return (
    <div className="laptop hub-extras">
      <h2 className="section-title">Media buttons</h2>
      {mediaRows.map((row, i) => (
        <div key={i} className={`row ${row.length >= 5 ? "five" : row.length === 4 ? "four" : "three"}`}>
          {row.map((b) => (
            <RemoteButton key={b.label} icon={b.icon} label={b.label} active={b.active} onPress={b.fn} />
          ))}
        </div>
      ))}

      <h2 className="section-title">Keys</h2>
      <div className="row five keys">
        {KEYS.map((k) => (
          <RemoteButton
            key={k.value}
            icon={k.icon}
            label={k.icon ? k.label : undefined}
            text={k.label}
            onPress={() => pc.action("key", { value: k.value })}
          />
        ))}
      </div>

      <h2 className="section-title">Shortcuts</h2>
      <div className="row five">
        {HOTKEYS.slice(0, DRAWER_SHORTCUTS).map((h) => (
          <RemoteButton key={h.label} icon={h.icon} label={h.label} onPress={() => pc.action(h.action)} />
        ))}
      </div>
    </div>
  );
}
