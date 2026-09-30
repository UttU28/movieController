"use client";

import { useState } from "react";
import {
  faArrowLeft,
  faBackwardStep,
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
  faWindowMaximize,
} from "@fortawesome/free-solid-svg-icons";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import { ResultList, fmt } from "../components/NowShowing";
import PlayerDock from "../components/PlayerDock";
import RemoteButton from "../components/RemoteButton";
import Sheet, { SheetToggle } from "../components/Sheet";
import SwipePad from "../components/SwipePad";
import TitleBar from "../components/TitleBar";
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
  i: "miniplayer",
  j: "seekBack",
  l: "seekForward",
};

const PAGE_LABELS = {
  home: "Home",
  search: "Search results",
  watch: "Watching",
  shorts: "Shorts",
  channel: "Channel",
  playlist: "Playlist",
  feed: "Feed",
};

const KIND_LABELS = {
  video: "Video",
  short: "Short",
  channel: "Channel",
  playlist: "Playlist",
  chip: "Filter",
  tab: "Tab",
  player: "Player",
};

// What the title bar says: what's playing, else what's highlighted.
function describe(state) {
  const page = PAGE_LABELS[state.pageType] || "YouTube";
  const { player, focus } = state;
  if (player) {
    const status = player.isAd ? "Ad" : player.paused ? "Paused" : "Playing";
    return {
      eyebrow: `${page} · ${status}`,
      title: player.title,
      sub: player.channel,
      time: player.duration ? `${fmt(player.currentTime)} / ${fmt(player.duration)}` : null,
      progress: player.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : null,
    };
  }
  if (focus) {
    return { eyebrow: `${page} · ${KIND_LABELS[focus.kind] || "Selected"}`, title: focus.title, sub: focus.channel };
  }
  return { eyebrow: page, title: "Swipe the pad to start moving", sub: "" };
}

export default function YouTubePanel() {
  const { state, connected, error, action, search, show } = useRemote("youtube");
  const pc = useRemote("laptop", { poll: false });
  const [resultsOpen, setResultsOpen] = useState(false);
  const results = state?.pageType === "search" ? state.results || [] : [];
  const player = state?.player;
  useKeyboardRemote(action, KEYS);

  const ready = isReady(connected, state);
  const info = ready ? describe(state) : null;

  return (
    <div className="media-layout">
      {ready ? (
        <div className="titlebar-wrap">
          <TitleBar
            {...info}
            placeholder="Search YouTube"
            onSearch={(q) => {
              search(q);
              setResultsOpen(true);
            }}
          >
            {(player?.canSkipAd || results.length > 0) && (
              <div className="titlebar-actions">
                {player?.canSkipAd && (
                  <button type="button" className="pill-btn accent" onClick={() => action("skipAd")}>
                    Skip ad
                  </button>
                )}
                {results.length > 0 && (
                  <SheetToggle
                    open={resultsOpen}
                    onToggle={() => setResultsOpen(!resultsOpen)}
                    openLabel="Hide results"
                    closedLabel={`Show results (${results.length})`}
                  />
                )}
              </div>
            )}
          </TitleBar>
          <Sheet open={resultsOpen && results.length > 0} title="Top results · tap to play" onClose={() => setResultsOpen(false)}>
            <ResultList
              header={false}
              results={results}
              onOpen={(index) => {
                setResultsOpen(false);
                action("openResult", { value: index });
              }}
            />
          </Sheet>
        </div>
      ) : (
        <ChromeStatus connected={connected} state={state} appName="YouTube" onShow={show} />
      )}

      {error && <div className="error">{error}</div>}

      <SwipePad onMove={(dir, opts) => action(dir, opts)} onSelect={() => action("select")} />

      <div className="row five">
        <RemoteButton icon={faArrowLeft} label="Back" onPress={() => action("back")} />
        <RemoteButton icon={faHouse} label="Home" onPress={() => action("home")} />
        <RemoteButton icon={faLocationCrosshairs} label="Focus" onPress={() => action("focus")} />
        <RemoteButton icon={faInfo} label="Mini" onPress={() => action("miniplayer")} />
        <RemoteButton icon={faRotate} label="Reload" onPress={() => action("reload")} />
      </div>

      <div className="row five">
        <RemoteButton icon={faVolumeLow} label="YT -" onPress={() => action("volumeDown")} />
        <RemoteButton icon={faVolumeHigh} label="YT +" onPress={() => action("volumeUp")} />
        <RemoteButton icon={faClosedCaptioning} label="CC" onPress={() => action("captions")} />
        <RemoteButton icon={faGauge} label={player ? `${player.rate}x` : "Speed"} onPress={() => action("speed")} />
        <RemoteButton icon={faExpand} label="Full" active={!!state?.fullscreen} onPress={() => action("fullscreen")} />
      </div>

      <div className="row five">
        <RemoteButton icon={faBackwardStep} label="Prev" onPress={() => action("previous")} />
        <RemoteButton icon={faWindowMaximize} label="Theater" onPress={() => action("theater")} />
        <RemoteButton icon={faVolumeXmark} label="PC Mute" onPress={() => pc.action("mute")} />
        <RemoteButton icon={faTv} label="TV" active={!!state?.tvMode} onPress={() => action("tvMode")} />
        <RemoteButton icon={faForwardStep} label="Next" onPress={() => action("next")} />
      </div>

      <PlayerDock player={player} action={action} />
    </div>
  );
}
