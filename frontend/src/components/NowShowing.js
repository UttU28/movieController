"use client";

import { useEffect, useRef, useState } from "react";
import { buzz } from "./RemoteButton";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlay,
  faFilm,
  faLayerGroup,
  faListUl,
  faMobileScreen,
  faTag,
  faTv,
  faUser,
} from "@fortawesome/free-solid-svg-icons";

const PAGE_LABELS = {
  home: "Home",
  search: "Search results",
  watch: "Watching",
  shorts: "Shorts",
  channel: "Channel",
  playlist: "Playlist",
  feed: "Feed",
  other: "YouTube",
};

const KIND_ICONS = {
  video: faFilm,
  short: faMobileScreen,
  channel: faUser,
  playlist: faListUl,
  chip: faTag,
  tab: faLayerGroup,
  player: faTv,
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

export function MarqueeTitle({ text }) {
  const boxRef = useRef(null);
  const measureRef = useRef(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const measure = measureRef.current;
    if (!box || !measure) return;

    const update = () => setScrolling(measure.scrollWidth > box.clientWidth + 2);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);

  const seconds = Math.max(10, (text?.length || 0) * 0.28);

  return (
    <div className={`player-title${scrolling ? " is-scrolling" : ""}`} ref={boxRef}>
      <div
        className="player-title-track"
        style={scrolling ? { animationDuration: `${seconds}s` } : undefined}
      >
        <span ref={measureRef}>{text}</span>
        {scrolling ? <span aria-hidden="true">{text}</span> : null}
      </div>
    </div>
  );
}

export function fmt(sec) {
  if (!sec || !isFinite(sec)) return "0:00";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const RESULT_KINDS = { short: "Short", playlist: "Playlist", mix: "Mix", channel: "Channel" };

// Search results as a tappable list (title, channel, length).
export function ResultList({ results, onOpen, header = true }) {
  return (
    <div className="detail">
      {header && <div className="eyebrow">Top results · tap to play</div>}
      <ol className="results">
        {results.map((r) => (
          <li key={r.href}>
            <button
              type="button"
              className="result"
              onClick={() => {
                buzz();
                onOpen(r.index);
              }}
            >
              <span className="result-text">
                <span className="result-title">{r.title}</span>
                <span className="episode-sub">
                  {[RESULT_KINDS[r.kind], r.channel].filter(Boolean).join(" · ")}
                </span>
              </span>
              {r.duration && <span className={`result-len${r.duration === "LIVE" ? " live" : ""}`}>{r.duration}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function NowShowing({ state, onSkipAd, onOpenResult }) {
  const focus = state?.focus;
  const player = state?.player;
  const progress = player?.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : 0;
  const hasResults = state?.results?.length > 0 && !!onOpenResult;

  return (
    <section className="card">
      <div className="card-row">
        <span className="page-pill">{PAGE_LABELS[state?.pageType] || "YouTube"}</span>
        {state?.fullscreen && <span className="page-pill muted">Fullscreen</span>}
        {state?.tvMode && <span className="page-pill muted">TV mode</span>}
      </div>

      {(focus || !hasResults) && (
        <div className="selected">
          <div className="selected-icon">
            <FontAwesomeIcon icon={KIND_ICONS[focus?.kind] || faCirclePlay} />
          </div>
          <div className="selected-text">
            <div className="eyebrow">{focus ? `Selected · ${KIND_LABELS[focus.kind] || focus.kind}` : "Nothing selected"}</div>
            <div className="selected-title">{focus?.title || "Press an arrow to start moving"}</div>
            {focus?.channel && <div className="selected-sub">{focus.channel}</div>}
          </div>
        </div>
      )}

      {player && (
        <div className="player">
          <div className="eyebrow">
            {player.isAd ? <span className="ad-badge">AD</span> : null}
            {player.paused ? "Paused" : "Now playing"}
            {player.rate !== 1 ? ` · ${player.rate}x` : ""}
            {` · Vol ${player.muted ? "muted" : player.volume}`}
          </div>
          <MarqueeTitle text={player.title} />
          {player.channel && <div className="selected-sub">{player.channel}</div>}
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="times">
            <span>{fmt(player.currentTime)}</span>
            <span>{fmt(player.duration)}</span>
          </div>
          {player.canSkipAd && (
            <button type="button" className="skip-ad" onClick={onSkipAd}>
              Skip ad
            </button>
          )}
        </div>
      )}
      {hasResults && <ResultList results={state.results} onOpen={onOpenResult} />}
    </section>
  );
}
