"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay } from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

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

// A streaming title's page on the phone: Play / Resume, seasons, episodes.
// `onPlayed` runs after anything starts playing (to close the sheet).
export default function TitleDetail({ detail, action, onPlayed }) {
  const play = (name, value) => {
    action(name, value === undefined ? undefined : { value });
    onPlayed?.();
  };

  return (
    <div className="detail title-detail">
      <div className="detail-head">
        <div className="detail-title">{detail.title}</div>
        {detail.playLabel && (
          <Tap className="play-main" onPress={() => play("play")}>
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
              <Tap className="episode" onPress={() => play("playEpisode", ep.index)}>
                <FontAwesomeIcon icon={faPlay} className="episode-play" />
                <span className="episode-text">
                  <span className="episode-title">{ep.number ? `${ep.number}. ${ep.title}` : ep.title}</span>
                  <span className="episode-sub">{[ep.runtime || ep.duration, ep.left].filter(Boolean).join(" · ")}</span>
                </span>
              </Tap>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
