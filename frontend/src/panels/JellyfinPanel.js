"use client";

import { useEffect, useState } from "react";
import {
  faArrowLeft,
  faBackwardStep,
  faBars,
  faBookOpen,
  faClosedCaptioning,
  faExpand,
  faForwardStep,
  faHouse,
  faListOl,
  faLocationCrosshairs,
  faRotate,
  faStop,
  faTv,
  faVolumeHigh,
  faVolumeLow,
  faVolumeXmark,
} from "@fortawesome/free-solid-svg-icons";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import JellyfinDetail from "../components/JellyfinDetail";
import JellyfinLibrary from "../components/JellyfinLibrary";
import { fmt } from "../components/NowShowing";
import PlayerDock from "../components/PlayerDock";
import RemoteButton, { buzz } from "../components/RemoteButton";
import Sheet, { SheetToggle } from "../components/Sheet";
import SwipePad from "../components/SwipePad";
import TitleBar from "../components/TitleBar";
import { sendAction } from "../lib/api";
import useJellyfinLibrary from "../lib/useJellyfinLibrary";
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
  m: "mute",
  n: "next",
  s: "skip",
  j: "seekBack",
  l: "seekForward",
};

const NO_KEYS = {};

const PAGE_LABELS = {
  home: "Home",
  browse: "Browse",
  detail: "Details",
  search: "Search",
  player: "Watching",
  login: "Sign in needed",
};

// Audio / subtitle choices for what's playing (read once per item).
function useTracks(itemId) {
  const [tracks, setTracks] = useState(null);
  useEffect(() => {
    setTracks(null);
    if (!itemId) return undefined;
    let live = true;
    sendAction("jellyfin", "item", itemId)
      .then((res) => live && setTracks({ audio: res.result.audio, subtitles: res.result.subtitles }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [itemId]);
  return tracks;
}

function describe(state) {
  const page = PAGE_LABELS[state.pageType] || "Jellyfin";
  const { player, focus, detail } = state;
  if (player) {
    return {
      eyebrow: `${page} · ${player.paused ? "Paused" : "Playing"}`,
      title: player.title,
      sub: player.subtitle,
      time: player.duration ? `${fmt(player.currentTime)} / ${fmt(player.duration)}` : null,
      progress: player.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : null,
    };
  }
  if (focus) return { eyebrow: `${page} · Selected`, title: focus.title, sub: focus.sub };
  if (detail) return { eyebrow: page, title: detail.title, sub: detail.playLabel };
  return { eyebrow: page, title: "Swipe the pad to start moving", sub: "" };
}

function TrackChips({ label, tracks, current, onPick, withOff }) {
  if (!tracks?.length) return null;
  return (
    <div className="jf-tracks">
      <span className="eyebrow">{label}</span>
      <div className="chips">
        {withOff && (
          <button type="button" className={`chip${current === -1 ? " on" : ""}`} onClick={() => onPick(-1)}>
            Off
          </button>
        )}
        {tracks.map((t) => (
          <button key={t.index} type="button" className={`chip${current === t.index ? " on" : ""}`} onClick={() => onPick(t.index)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JellyfinPanel() {
  const { state, connected, error, action, show } = useRemote("jellyfin");
  const pc = useRemote("laptop", { poll: false });
  const library = useJellyfinLibrary();
  const [view, setView] = useState("remote");
  const [tracksOpen, setTracksOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const player = state?.player;
  const detail = !player ? state?.detail : null;
  const tracks = useTracks(player?.id);
  useKeyboardRemote(action, view === "remote" ? KEYS : NO_KEYS);

  const ready = isReady(connected, state);
  const hasTracks = !!(tracks?.subtitles?.length || tracks?.audio?.length > 1);
  const episodes = detail?.episodes?.length || 0;
  const listLabel = detail?.listLabel || "Episodes";

  // Opening a title on the TV shows its play options / episodes; leaving it
  // closes the sheet.
  const detailKey = detail ? detail.id : null;
  useEffect(() => {
    setDetailOpen(!!detailKey);
    if (detailKey) setTracksOpen(false);
  }, [detailKey]);

  const searchLibrary = (query) => {
    library.reset({ kind: "search", query });
    setView("library");
  };

  // Starting something from the library goes back to the remote view.
  const libraryAction = (name, opts) => {
    if (name === "play" || name === "show") setView("remote");
    return action(name, opts);
  };

  const titleBar = ready ? (
    <div className="titlebar-wrap">
      <TitleBar {...describe(state)} placeholder="Search your Jellyfin library" onSearch={searchLibrary}>
        {(player?.skipLabel || hasTracks || detail) && view === "remote" && (
          <div className="titlebar-actions">
            {player?.skipLabel && (
              <button type="button" className="pill-btn accent" onClick={() => { buzz(); action("skip"); }}>
                {player.skipLabel}
              </button>
            )}
            {detail && (
              <SheetToggle
                open={detailOpen}
                onToggle={() => setDetailOpen(!detailOpen)}
                openLabel="Hide"
                closedLabel={episodes ? `${listLabel} (${episodes})` : "Play options"}
              />
            )}
            {hasTracks && (
              <SheetToggle open={tracksOpen} onToggle={() => setTracksOpen(!tracksOpen)} openLabel="Hide" closedLabel="Audio & subtitles" />
            )}
          </div>
        )}
      </TitleBar>
      <Sheet
        open={detailOpen && !!detail && view === "remote"}
        title={episodes ? `${detail.seasons?.length ? "Seasons & episodes" : listLabel} · tap to play` : "Play"}
        onClose={() => setDetailOpen(false)}
      >
        {detail && <JellyfinDetail detail={detail} action={action} onPlayed={() => setDetailOpen(false)} />}
      </Sheet>
      <Sheet open={tracksOpen && hasTracks && view === "remote"} title="Audio & subtitles" onClose={() => setTracksOpen(false)}>
        <TrackChips
          label="Subtitles"
          tracks={tracks?.subtitles}
          current={player?.subtitleIndex}
          withOff
          onPick={(i) => action("subtitle", { value: i })}
        />
        {tracks?.audio?.length > 1 && (
          <TrackChips label="Audio" tracks={tracks.audio} current={player?.audioIndex} onPick={(i) => action("audio", { value: i })} />
        )}
      </Sheet>
    </div>
  ) : (
    <ChromeStatus connected={connected} state={state} appName="Jellyfin" onShow={show} />
  );

  if (view === "library") {
    return (
      <div className="media-layout">
        {titleBar}
        {error && <div className="error">{error}</div>}
        <div className="library-scroll">
          <JellyfinLibrary library={library} action={libraryAction} onClose={() => setView("remote")} />
        </div>
        <PlayerDock player={player} action={action} />
      </div>
    );
  }

  return (
    <div className="media-layout">
      {titleBar}

      {error && <div className="error">{error}</div>}

      <SwipePad onMove={(dir, opts) => action(dir, opts)} onSelect={() => action("select")} />

      <div className="row five">
        <RemoteButton icon={faArrowLeft} label="Back" onPress={() => action("back")} />
        <RemoteButton icon={faHouse} label="Home" onPress={() => action("home")} />
        <RemoteButton icon={faLocationCrosshairs} label="Focus" onPress={() => action("focus")} />
        <RemoteButton icon={faBars} label="Menu" onPress={() => action("menu")} />
        <RemoteButton icon={faBookOpen} label="Library" onPress={() => setView("library")} />
      </div>

      <div className="row five">
        <RemoteButton icon={faVolumeLow} label="JF -" onPress={() => action("volumeDown")} />
        <RemoteButton icon={faVolumeHigh} label="JF +" onPress={() => action("volumeUp")} />
        {detail ? (
          <RemoteButton
            icon={faListOl}
            label={episodes ? listLabel : "Play"}
            active={detailOpen}
            onPress={() => setDetailOpen(!detailOpen)}
          />
        ) : (
          <RemoteButton
            icon={faClosedCaptioning}
            label="Subtitles"
            active={tracksOpen}
            disabled={!hasTracks}
            onPress={() => setTracksOpen(!tracksOpen)}
          />
        )}
        <RemoteButton icon={faRotate} label="Reload" onPress={() => action("reload")} />
        <RemoteButton icon={faExpand} label="Full" active={!!player?.fullscreen} onPress={() => action("fullscreen")} />
      </div>

      <div className="row five">
        <RemoteButton icon={faBackwardStep} label="Prev" onPress={() => action("previous")} />
        <RemoteButton icon={faStop} label="Stop" onPress={() => action("stop")} />
        <RemoteButton icon={faVolumeXmark} label="PC Mute" onPress={() => pc.action("mute")} />
        <RemoteButton icon={faTv} label="TV" active={!!state?.tvMode} onPress={() => action("tvMode")} />
        <RemoteButton icon={faForwardStep} label="Next" onPress={() => action("next")} />
      </div>

      <PlayerDock player={player} action={action} />
    </div>
  );
}
