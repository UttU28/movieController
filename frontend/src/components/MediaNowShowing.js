"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCirclePlay,
  faFilm,
  faForwardStep,
  faLayerGroup,
  faListOl,
  faPlay,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { MarqueeTitle, fmt } from "./NowShowing";
import { buzz } from "./RemoteButton";

const KIND_ICONS = {
  title: faFilm,
  episode: faListOl,
  tab: faLayerGroup,
  button: faCirclePlay,
  profile: faUser,
};

const KIND_LABELS = {
  title: "Title",
  episode: "Episode",
  tab: "Tab",
  button: "Button",
  profile: "Profile",
};

function Tap({ className, onPress, children, ...rest }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        buzz();
        onPress();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// What's on screen in a streaming app (Prime Video, Netflix): the highlighted
// item, a title's seasons and episodes, profile picker, or the player.
export default function MediaNowShowing({ state, action, pageLabels, appName }) {
  const { focus, detail, player, profiles } = state;
  const progress = player?.duration ? Math.min(100, (player.currentTime / player.duration) * 100) : 0;

  return (
    <section className="card">
      <div className="card-row">
        <span className="page-pill">{pageLabels[state.pageType] || appName}</span>
        {player?.fullscreen && <span className="page-pill muted">Fullscreen</span>}
        {state.tvMode && <span className="page-pill muted">TV mode</span>}
      </div>

      {!player && (
        <div className="selected">
          <div className="selected-icon">
            <FontAwesomeIcon icon={KIND_ICONS[focus?.kind] || faCirclePlay} />
          </div>
          <div className="selected-text">
            <div className="eyebrow">{focus ? `Selected · ${KIND_LABELS[focus.kind] || focus.kind}` : "Nothing selected"}</div>
            <div className="selected-title">{focus?.title || "Press an arrow to start moving"}</div>
            {focus?.sub && <div className="selected-sub">{focus.sub}</div>}
          </div>
        </div>
      )}

      {profiles?.length > 0 && (
        <div className="detail">
          <div className="eyebrow">Who&apos;s watching?</div>
          <div className="chips">
            {profiles.map((name, i) => (
              <Tap key={name} className="chip" onPress={() => action("profile", { value: i })}>
                <FontAwesomeIcon icon={faUser} /> {name}
              </Tap>
            ))}
          </div>
        </div>
      )}

      {detail && !player && (
        <div className="detail">
          <div className="detail-head">
            <div className="detail-title">{detail.title}</div>
            {detail.playLabel && (
              <Tap className="play-main" onPress={() => action("play")}>
                <FontAwesomeIcon icon={faPlay} /> {detail.playLabel}
              </Tap>
            )}
          </div>

          {detail.seasons?.length > 1 && (
            <div className="chips" role="tablist" aria-label="Seasons">
              {detail.seasons.map((s, i) => (
                <Tap
                  key={s.label}
                  className={`chip${s.selected ? " on" : ""}`}
                  aria-selected={s.selected}
                  role="tab"
                  onPress={() => action("season", { value: i })}
                >
                  {s.label}
                </Tap>
              ))}
            </div>
          )}

          {detail.episodes?.length > 0 && (
            <ol className="episodes">
              {detail.episodes.map((ep) => (
                <li key={ep.index}>
                  <Tap className="episode" onPress={() => action("playEpisode", { value: ep.index })}>
                    <FontAwesomeIcon icon={faPlay} className="episode-play" />
                    <span className="episode-text">
                      <span className="episode-title">{ep.title}</span>
                      <span className="episode-sub">{[ep.runtime, ep.left].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Tap>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {player && (
        <div className="player">
          <div className="eyebrow">
            {player.isAd ? <span className="ad-badge">AD</span> : null}
            {player.paused ? "Paused" : "Now playing"}
            {` · Vol ${player.muted ? "muted" : player.volume}`}
          </div>
          <MarqueeTitle text={player.title} />
          {player.subtitle && <div className="selected-sub">{player.subtitle}</div>}
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="times">
            <span>{fmt(player.currentTime)}</span>
            <span>-{fmt(Math.max(0, player.duration - player.currentTime))}</span>
          </div>
          {(player.skipLabel || player.hasNext) && (
            <div className="player-actions">
              {player.skipLabel && (
                <Tap className="skip-ad" onPress={() => action("skip")}>
                  {player.skipLabel}
                </Tap>
              )}
              {player.hasNext && (
                <Tap className="next-episode" onPress={() => action("next")}>
                  Next episode <FontAwesomeIcon icon={faForwardStep} />
                </Tap>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
