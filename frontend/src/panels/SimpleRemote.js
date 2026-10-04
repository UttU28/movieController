"use client";

import { useEffect, useState } from "react";
import {
  faExpand,
  faForwardFast,
  faForwardStep,
  faGripVertical,
  faHandPointer,
  faKeyboard,
  faListOl,
  faPaperPlane,
  faRotate,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import { MarqueeTitle, ResultList, fmt } from "../components/NowShowing";
import PlayerDock from "../components/PlayerDock";
import RemoteButton, { buzz } from "../components/RemoteButton";
import Sheet, { SheetToggle } from "../components/Sheet";
import SkipNotice from "../components/SkipNotice";
import SwipePad from "../components/SwipePad";
import TitleBar from "../components/TitleBar";
import TitleDetail from "../components/TitleDetail";
import JellyfinDetail from "../components/JellyfinDetail";
import { useAppRemote } from "../lib/RemoteAppContext";
import useKeyboardRemote from "../lib/useKeyboardRemote";
import usePointerSocket from "../lib/usePointerSocket";
import useRemote from "../lib/useRemote";
import { KEYS, TextSend, TrackpadDot, useTrackpadSensitivity } from "./LaptopPanel";
import Trackpad from "../components/Trackpad";

const APP_KEYS = {
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

// The minimal remote: what's playing and what's next (with skip / episode
// buttons), the joystick, and a trackpad strip with the mouse buttons and a
// keyboard. Everything else lives in the bubble.
export default function SimpleRemote({ app, appName }) {
  const { state, connected, error, action, search, show } = useAppRemote();
  const pc = useRemote("laptop", { poll: false });
  const { status, send } = usePointerSocket();
  const [sensitivity] = useTrackpadSensitivity();
  const [detailOpen, setDetailOpen] = useState(false);
  const [upNextOpen, setUpNextOpen] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  useKeyboardRemote(action, APP_KEYS);

  const ready = isReady(connected, state);
  const player = state?.player;
  const detail = !player ? state?.detail : null;
  const upNext = state?.upNext || [];
  const results = app === "youtube" && state?.pageType === "search" ? state.results || [] : [];
  const nextVideo = app === "youtube" && player ? upNext[0] : null;
  const episodes = detail?.episodes?.length || 0;

  // Same follow-along as the full panels: a title page opens its episode
  // sheet; a new video opens up-next.
  const detailKey = detail ? detail.title || detail.id : null;
  useEffect(() => {
    setDetailOpen(!!detailKey);
  }, [detailKey]);
  const playingTitle = player?.title || null;
  useEffect(() => {
    if (playingTitle && app === "youtube") setUpNextOpen(true);
  }, [playingTitle, app]);

  const info = player
    ? {
        eyebrow: player.isAd ? "Ad" : player.paused ? "Paused" : "Playing",
        title: player.title,
        sub: (player.isAd && player.adLabel) || player.subtitle,
        time: player.duration ? `${fmt(player.currentTime)} / ${fmt(player.duration)}` : null,
        progress: player.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : null,
      }
    : detail
      ? { eyebrow: appName, title: detail.title, sub: detail.playLabel }
      : state?.focus?.title
        ? { eyebrow: `${appName} · Selected`, title: state.focus.title, sub: state.focus.sub || state.focus.channel }
        : { eyebrow: appName, title: "Swipe the pad to start moving", sub: "" };

  const toggleDrag = () => {
    const next = !dragging;
    setDragging(next);
    send({ t: "d", on: next });
  };

  return (
    <div className="media-layout">
      <SkipNotice skips={state?.skips} />
      {ready ? (
        <div className="titlebar-wrap">
          <TitleBar {...info} placeholder={`Search ${appName}`} onSearch={search}>
            <div className="titlebar-actions">
              {player?.skipLabel && (
                <button type="button" className="pill-btn skip" onClick={() => { buzz(); action("skip"); }}>
                  <FontAwesomeIcon icon={faForwardFast} /> {player.skipLabel}
                </button>
              )}
              {player?.hasNext && (
                <button type="button" className="pill-btn" onClick={() => { buzz(); action("next"); }}>
                  <FontAwesomeIcon icon={faForwardStep} /> Next episode
                </button>
              )}
              {detail && app !== "youtube" && (
                <SheetToggle
                  open={detailOpen}
                  onToggle={() => setDetailOpen(!detailOpen)}
                  openLabel="Hide"
                  closedLabel={episodes ? `Episodes (${episodes})` : "Play options"}
                />
              )}
              {app === "youtube" && upNext.length > 0 && (
                <SheetToggle
                  open={upNextOpen}
                  onToggle={() => setUpNextOpen(!upNextOpen)}
                  openLabel="Hide up next"
                  closedLabel={`Up next (${upNext.length})`}
                />
              )}
              {results.length > 0 && (
                <SheetToggle
                  open={resultsOpen}
                  onToggle={() => setResultsOpen(!resultsOpen)}
                  openLabel="Hide results"
                  closedLabel={`Results (${results.length})`}
                />
              )}
            </div>
          </TitleBar>

          {/* What's next, in one tap. */}
          {(nextVideo || player?.hasNext) && (
            <div className="next-row">
              <span className="eyebrow">Next</span>
              <button
                type="button"
                className="pill-btn next-chip"
                onClick={() => {
                  buzz();
                  if (nextVideo) action("openUpNext", { value: 0 });
                  else action("next");
                }}
              >
                <FontAwesomeIcon icon={faListOl} />
                <MarqueeTitle text={nextVideo ? nextVideo.title : "Next episode"} />
              </button>
            </div>
          )}

          {detail && app !== "youtube" && (
            <Sheet open={detailOpen && !!detail} title={episodes ? "Seasons & episodes · tap to play" : "Play"} onClose={() => setDetailOpen(false)}>
              {app === "jellyfin" ? (
                <JellyfinDetail detail={detail} action={action} onPlayed={() => setDetailOpen(false)} />
              ) : (
                <TitleDetail detail={detail} action={action} onPlayed={() => setDetailOpen(false)} />
              )}
            </Sheet>
          )}
          {app === "youtube" && (
            <Sheet open={upNextOpen && upNext.length > 0} title="Up next · tap to play" onClose={() => setUpNextOpen(false)}>
              <ResultList
                header={false}
                results={upNext}
                onOpen={(index) => {
                  setUpNextOpen(false);
                  action("openUpNext", { value: index });
                }}
              />
            </Sheet>
          )}
          {app === "youtube" && (
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
          )}
        </div>
      ) : (
        <ChromeStatus connected={connected} state={state} appName={appName} onShow={show} />
      )}

      {error && <div className="error">{error}</div>}

      <SwipePad onMove={(dir, opts) => action(dir, opts)} onSelect={() => action("select")} />

      {/* Mouse control, squeezed onto the main screen. */}
      <section className="card laptop mouse-strip">
        <div className="pad-wrap pad-wrap-dot">
          <Trackpad send={send} sensitivity={sensitivity} />
          <TrackpadDot status={status} />
        </div>
        <div className="row five">
          <RemoteButton icon={faHandPointer} label="Left" onPress={() => send({ t: "c", b: "left" })} />
          <RemoteButton icon={faRotate} label="Reload" onPress={() => window.location.reload()} />
          <RemoteButton icon={faHandPointer} label="Right" onPress={() => send({ t: "c", b: "right" })} />
          <RemoteButton icon={faGripVertical} label={dragging ? "Release" : "Drag"} active={dragging} onPress={toggleDrag} />
          <RemoteButton icon={faKeyboard} label="Keyboard" active={keysOpen} onPress={() => setKeysOpen(!keysOpen)} />
        </div>
        {keysOpen && (
          <>
            <TextSend
              placeholder="Type on the laptop…"
              button={<FontAwesomeIcon icon={faPaperPlane} />}
              buttonLabel="Send"
              autoFocus
              onSend={(text) => pc.action("type", { value: text })}
            />
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
          </>
        )}
      </section>

      <PlayerDock player={player} action={action} />
    </div>
  );
}
