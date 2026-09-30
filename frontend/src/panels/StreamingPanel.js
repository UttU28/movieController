"use client";

import { useEffect, useState } from "react";
import {
  faArrowLeft,
  faClosedCaptioning,
  faExpand,
  faForwardFast,
  faForwardStep,
  faHouse,
  faListOl,
  faLocationCrosshairs,
  faRotate,
  faTv,
  faUser,
  faVolumeHigh,
  faVolumeLow,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import { fmt } from "../components/NowShowing";
import PlayerDock from "../components/PlayerDock";
import RemoteButton, { buzz } from "../components/RemoteButton";
import Sheet, { SheetToggle } from "../components/Sheet";
import SwipePad from "../components/SwipePad";
import TitleBar from "../components/TitleBar";
import TitleDetail from "../components/TitleDetail";
import useKeyboardRemote from "../lib/useKeyboardRemote";
import useRemote from "../lib/useRemote";

const KEYS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "select",
  Backspace: "back",
  Escape: "back",
  " ": "playPause",
  h: "home",
  f: "fullscreen",
  m: "mute",
  n: "next",
  s: "skip",
  j: "seekBack",
  l: "seekForward",
};

const KIND_LABELS = { title: "Title", episode: "Episode", tab: "Tab", button: "Button", profile: "Profile" };

// What the title bar says: what's playing, the title page, or what's highlighted.
function describe(state, pageLabels, appName) {
  const page = pageLabels[state.pageType] || appName;
  const { player, detail, focus } = state;
  if (player) {
    const status = player.isAd ? "Ad" : player.paused ? "Paused" : "Playing";
    return {
      eyebrow: `${page} · ${status}`,
      title: player.title,
      sub: player.subtitle,
      time: player.duration ? `${fmt(player.currentTime)} / ${fmt(player.duration)}` : null,
      progress: player.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : null,
    };
  }
  if (focus) {
    return { eyebrow: `${page} · ${KIND_LABELS[focus.kind] || "Selected"}`, title: focus.title, sub: focus.sub };
  }
  if (detail) return { eyebrow: page, title: detail.title, sub: detail.playLabel };
  return { eyebrow: page, title: "Swipe the pad to start moving", sub: "" };
}

// Remote for a streaming site (Prime Video, Netflix). `sections` are the two
// shortcut buttons in the navigation row, e.g. Movies and TV shows.
export default function StreamingPanel({ app, appName, audioLabel, pageLabels, sections }) {
  const { state, connected, error, action, search, show } = useRemote(app);
  const pc = useRemote("laptop", { poll: false });
  const [detailOpen, setDetailOpen] = useState(false);
  useKeyboardRemote(action, KEYS);

  const ready = isReady(connected, state);
  const player = state?.player;
  const detail = !player ? state?.detail : null;
  const profiles = state?.profiles || [];

  // Opening a title shows its episodes; leaving it closes the sheet.
  const detailKey = detail ? detail.title : null;
  useEffect(() => {
    setDetailOpen(!!detailKey);
  }, [detailKey]);

  const episodes = detail?.episodes?.length || 0;

  return (
    <div className="media-layout">
      {ready ? (
        <div className="titlebar-wrap">
          <TitleBar {...describe(state, pageLabels, appName)} placeholder={`Search ${appName}`} onSearch={search}>
            {(player?.skipLabel || player?.hasNext || detail || profiles.length > 0) && (
              <div className="titlebar-actions">
                {profiles.map((name, i) => (
                  <button key={name} type="button" className="pill-btn" onClick={() => { buzz(); action("profile", { value: i }); }}>
                    <FontAwesomeIcon icon={faUser} /> {name}
                  </button>
                ))}
                {player?.skipLabel && (
                  <button type="button" className="pill-btn accent" onClick={() => { buzz(); action("skip"); }}>
                    {player.skipLabel}
                  </button>
                )}
                {player?.hasNext && (
                  <button type="button" className="pill-btn" onClick={() => { buzz(); action("next"); }}>
                    Next episode
                  </button>
                )}
                {detail && (
                  <SheetToggle
                    open={detailOpen}
                    onToggle={() => setDetailOpen(!detailOpen)}
                    openLabel="Hide"
                    closedLabel={episodes ? `Episodes (${episodes})` : "Play options"}
                  />
                )}
              </div>
            )}
          </TitleBar>
          <Sheet open={detailOpen && !!detail} title={episodes ? "Seasons & episodes · tap to play" : "Play"} onClose={() => setDetailOpen(false)}>
            {detail && <TitleDetail detail={detail} action={action} onPlayed={() => setDetailOpen(false)} />}
          </Sheet>
        </div>
      ) : (
        <ChromeStatus connected={connected} state={state} appName={appName} onShow={show} />
      )}

      {error && <div className="error">{error}</div>}

      <SwipePad onMove={(dir, opts) => action(dir, opts)} onSelect={() => action("select")} />

      <div className="row five">
        <RemoteButton icon={faArrowLeft} label="Back" onPress={() => action("back")} />
        <RemoteButton icon={faHouse} label="Home" onPress={() => action("section", { value: "home" })} />
        <RemoteButton icon={faLocationCrosshairs} label="Focus" onPress={() => action("focus")} />
        {sections.map((s) => (
          <RemoteButton key={s.value} icon={s.icon} label={s.label} onPress={() => action("section", { value: s.value })} />
        ))}
      </div>

      <div className="row five">
        <RemoteButton icon={faVolumeLow} label={`${audioLabel} -`} onPress={() => { action("volumeDown"); pc.action("volumeDown"); }} />
        <RemoteButton icon={faVolumeHigh} label={`${audioLabel} +`} onPress={() => { action("volumeUp"); pc.action("volumeUp"); }} />
        <RemoteButton icon={faClosedCaptioning} label="Subtitles" onPress={() => action("subtitles")} />
        <RemoteButton icon={faExpand} label="Full" active={!!player?.fullscreen} onPress={() => action("fullscreen")} />
        <RemoteButton
          icon={faListOl}
          label="Episodes"
          active={detailOpen}
          disabled={!detail}
          onPress={() => setDetailOpen(!detailOpen)}
        />
      </div>

      <div className="row five">
        <RemoteButton icon={faForwardFast} label="Skip" active={!!player?.skipLabel} onPress={() => action("skip")} />
        <RemoteButton icon={faRotate} label="Reload" onPress={() => action("reload")} />
        <RemoteButton icon={faVolumeXmark} label="PC Mute" onPress={() => pc.action("mute")} />
        <RemoteButton icon={faTv} label="TV" active={!!state?.tvMode} onPress={() => action("tvMode")} />
        <RemoteButton icon={faForwardStep} label="Next ep" onPress={() => action("next")} />
      </div>

      <PlayerDock player={player} action={action} />
    </div>
  );
}
