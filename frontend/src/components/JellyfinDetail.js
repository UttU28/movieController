"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPlay, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
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

// The title page the TV is showing in Jellyfin: Play / Resume (with "From
// start"), and for shows the seasons and their episodes, each playable.
// `onPlayed` runs after anything starts playing (to close the sheet).
export default function JellyfinDetail({ detail, action, onPlayed }) {
  const play = (id, fromStart = false) => {
    action("play", { value: { id, fromStart } });
    onPlayed?.();
  };
  const sub = [detail.year, detail.runtime, detail.resumeAt ? `stopped at ${detail.resumeAt}` : null].filter(Boolean).join(" · ");

  return (
    <div className="detail title-detail">
      <div className="detail-head">
        <div className="detail-title">
          {detail.title}
          {sub && <div className="episode-sub">{sub}</div>}
        </div>
        {detail.playId && (
          <div className="jf-play-btns">
            <Tap className="play-main" onPress={() => play(detail.playId)}>
              <FontAwesomeIcon icon={faPlay} /> {detail.playLabel}
            </Tap>
            {detail.canResume && (
              <Tap className="chip" onPress={() => play(detail.playId, true)}>
                <FontAwesomeIcon icon={faRotateLeft} /> From start
              </Tap>
            )}
          </div>
        )}
      </div>

      {detail.progress > 0 && (
        <span className="jf-progress inline">
          <span style={{ width: `${detail.progress}%` }} />
        </span>
      )}

      {detail.seasons?.length > 1 && (
        <div className="chips" role="tablist" aria-label="Seasons">
          {detail.seasons.map((s) => (
            <Tap
              key={s.id}
              className={`chip${s.selected ? " on" : ""}`}
              aria-selected={s.selected}
              role="tab"
              onPress={() => action("season", { value: s.id })}
            >
              {s.label}
            </Tap>
          ))}
        </div>
      )}

      {detail.episodes?.length > 0 && (
        <ol className="episodes">
          {detail.episodes.map((ep) => (
            <li key={ep.id}>
              <Tap className={`episode${ep.played ? " watched" : ""}`} onPress={() => play(ep.id)}>
                <FontAwesomeIcon icon={ep.played ? faCheck : faPlay} className="episode-play" />
                <span className="episode-text">
                  <span className="episode-title">{ep.number != null ? `${ep.number}. ${ep.title}` : ep.title}</span>
                  <span className="episode-sub">
                    {[detail.listLabel ? ep.year : null, ep.runtime, ep.left, ep.id === detail.nextEpisode?.id ? "Up next" : null].filter(Boolean).join(" · ")}
                  </span>
                  {ep.progress > 0 && (
                    <span className="jf-progress inline">
                      <span style={{ width: `${ep.progress}%` }} />
                    </span>
                  )}
                </span>
              </Tap>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
