"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faBackwardStep,
  faBars,
  faCirclePlay,
  faExpand,
  faFilm,
  faForwardFast,
  faForwardStep,
  faHouse,
  faLayerGroup,
  faListOl,
  faLocationCrosshairs,
  faPause,
  faPlay,
  faRotate,
  faRotateLeft,
  faRotateRight,
  faStop,
  faTv,
  faTvAlt,
} from "@fortawesome/free-solid-svg-icons";
import AudioRow from "../components/AudioRow";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import DPad from "../components/DPad";
import JellyfinLibrary from "../components/JellyfinLibrary";
import { MarqueeTitle, fmt } from "../components/NowShowing";
import RemoteButton, { buzz } from "../components/RemoteButton";
import SearchBar from "../components/SearchBar";
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

const KIND_ICONS = { title: faFilm, episode: faListOl, button: faCirclePlay, tab: faLayerGroup };

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

function JellyfinNowShowing({ state, action }) {
  const { focus, player } = state;
  const tracks = useTracks(player?.id);
  const progress = player?.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : 0;

  const seekFromTap = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    buzz();
    action("seekTo", { value: fraction });
  };

  return (
    <section className="card">
      <div className="card-row">
        <span className="page-pill">{PAGE_LABELS[state.pageType] || "Jellyfin"}</span>
        {state.layout === "tv" && <span className="page-pill muted">TV layout</span>}
        {state.tvMode && <span className="page-pill muted">TV mode</span>}
      </div>

      {!player && (
        <div className="selected">
          <div className="selected-icon">
            <FontAwesomeIcon icon={KIND_ICONS[focus?.kind] || faCirclePlay} />
          </div>
          <div className="selected-text">
            <div className="eyebrow">{focus ? "Selected" : "Nothing selected"}</div>
            <div className="selected-title">{focus?.title || "Press an arrow to start moving"}</div>
            {focus?.sub && <div className="selected-sub">{focus.sub}</div>}
          </div>
        </div>
      )}

      {player && (
        <div className="player">
          <div className="jf-now">
            {player.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="jf-now-art" src={player.image} alt="" />
            )}
            <div className="jf-now-text">
              <div className="eyebrow">
                {player.paused ? "Paused" : "Now playing"}
                {` · Vol ${player.muted ? "muted" : player.volume}`}
              </div>
              <MarqueeTitle text={player.title} />
              {player.subtitle && <div className="selected-sub">{player.subtitle}</div>}
            </div>
          </div>
          <button type="button" className="progress seekable" onClick={seekFromTap} aria-label="Seek">
            <span className="progress-fill" style={{ width: `${progress}%` }} />
          </button>
          <div className="times">
            <span>{fmt(player.currentTime)}</span>
            <span>-{fmt(Math.max(0, player.duration - player.currentTime))}</span>
          </div>
          {player.skipLabel && (
            <button type="button" className="skip-ad" onClick={() => action("skip")}>
              {player.skipLabel}
            </button>
          )}
          {tracks?.subtitles?.length > 0 && (
            <div className="jf-tracks">
              <span className="eyebrow">Subtitles</span>
              <div className="chips">
                <button
                  type="button"
                  className={`chip${player.subtitleIndex === -1 ? " on" : ""}`}
                  onClick={() => action("subtitle", { value: -1 })}
                >
                  Off
                </button>
                {tracks.subtitles.map((t) => (
                  <button
                    key={t.index}
                    type="button"
                    className={`chip${player.subtitleIndex === t.index ? " on" : ""}`}
                    onClick={() => action("subtitle", { value: t.index })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {tracks?.audio?.length > 1 && (
            <div className="jf-tracks">
              <span className="eyebrow">Audio</span>
              <div className="chips">
                {tracks.audio.map((t) => (
                  <button
                    key={t.index}
                    type="button"
                    className={`chip${player.audioIndex === t.index ? " on" : ""}`}
                    onClick={() => action("audio", { value: t.index })}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function JellyfinPanel() {
  const { state, connected, error, action, show } = useRemote("jellyfin");
  const library = useJellyfinLibrary();
  const [view, setView] = useState("remote");
  const player = state?.player;
  const tvLayout = state?.layout === "tv";
  useKeyboardRemote(action, view === "remote" ? KEYS : NO_KEYS);

  const searchLibrary = (query) => {
    library.reset({ kind: "search", query });
    setView("library");
  };

  return (
    <>
      <div className="segmented" role="tablist">
        {["remote", "library"].map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={view === v ? "on" : ""}
            onClick={() => {
              buzz();
              setView(v);
            }}
          >
            {v === "remote" ? "Remote" : "Library"}
          </button>
        ))}
      </div>

      {isReady(connected, state) ? (
        view === "remote" && <JellyfinNowShowing state={state} action={action} />
      ) : (
        <ChromeStatus connected={connected} state={state} appName="Jellyfin" onShow={show} />
      )}

      {error && <div className="error">{error}</div>}

      <SearchBar onSearch={searchLibrary} placeholder="Search your Jellyfin library" />

      {view === "library" ? (
        <JellyfinLibrary library={library} action={action} />
      ) : (
        <>
          <div className="row five">
            <RemoteButton icon={faArrowLeft} label="Back" onPress={() => action("back")} />
            <RemoteButton icon={faHouse} label="Home" onPress={() => action("home")} />
            <RemoteButton icon={faLocationCrosshairs} label="Focus" onPress={() => action("focus")} />
            <RemoteButton icon={faBars} label="Menu" onPress={() => action("menu")} />
            <RemoteButton
              icon={faTvAlt}
              label={tvLayout ? "Desktop UI" : "TV UI"}
              active={tvLayout}
              onPress={() => action("layout", { value: tvLayout ? "desktop" : "tv" })}
            />
          </div>

          <DPad onMove={(dir, opts) => action(dir, opts)} onSelect={() => action("select")} />

          <div className="row five">
            <RemoteButton icon={faRotateLeft} label="-10s" onPress={() => action("seekBack")} />
            <RemoteButton
              icon={player && !player.paused ? faPause : faPlay}
              label={player && !player.paused ? "Pause" : "Play"}
              accent
              onPress={() => action("playPause")}
            />
            <RemoteButton icon={faRotateRight} label="+10s" onPress={() => action("seekForward")} />
            <RemoteButton icon={faForwardFast} label="Skip" active={!!player?.skipLabel} onPress={() => action("skip")} />
            <RemoteButton icon={faForwardStep} label="Next" onPress={() => action("next")} />
          </div>

          <AudioRow appLabel="JF" onAppUp={() => action("volumeUp")} onAppDown={() => action("volumeDown")} />

          <div className="row five">
            <RemoteButton icon={faBackwardStep} label="Prev" onPress={() => action("previous")} />
            <RemoteButton icon={faStop} label="Stop" onPress={() => action("stop")} />
            <RemoteButton icon={faExpand} label="Full" active={!!player?.fullscreen} onPress={() => action("fullscreen")} />
            <RemoteButton icon={faRotate} label="Reload" onPress={() => action("reload")} />
            <RemoteButton icon={faTv} label="TV" active={!!state?.tvMode} onPress={() => action("tvMode")} />
          </div>
        </>
      )}
    </>
  );
}
