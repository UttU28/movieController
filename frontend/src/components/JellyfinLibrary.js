"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faCheck,
  faCirclePlay,
  faFilm,
  faFolder,
  faHouse,
  faPlay,
  faRotateLeft,
  faStar,
  faTv,
} from "@fortawesome/free-solid-svg-icons";
import { buzz } from "./RemoteButton";

const TYPE_LABELS = {
  Movie: "Movie",
  Series: "Series",
  Season: "Season",
  Episode: "Episode",
  BoxSet: "Collection",
  Folder: "Folder",
  CollectionFolder: "Library",
  UserView: "Library",
  Video: "Video",
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

function Poster({ item, wide }) {
  return (
    <div className={`jf-poster${wide ? " wide" : ""}`}>
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image} alt="" loading="lazy" />
      ) : (
        <FontAwesomeIcon icon={item.folder ? faFolder : faFilm} className="jf-poster-icon" />
      )}
      {item.played && (
        <span className="jf-badge done">
          <FontAwesomeIcon icon={faCheck} />
        </span>
      )}
      {!item.played && item.unplayed > 0 && <span className="jf-badge">{item.unplayed}</span>}
      {item.progress > 0 && !item.played && (
        <span className="jf-progress">
          <span style={{ width: `${item.progress}%` }} />
        </span>
      )}
    </div>
  );
}

function subLine(item) {
  if (item.type === "Episode") {
    return [item.series, item.season != null && item.index != null ? `S${item.season}:E${item.index}` : null].filter(Boolean).join(" · ");
  }
  const bits = [];
  if (item.year) bits.push(item.year);
  if (item.folder && item.childCount != null) bits.push(`${item.childCount} items`);
  else if (item.runtime) bits.push(`${item.runtime} min`);
  return bits.join(" · ") || TYPE_LABELS[item.type] || item.type;
}

// Folders open as a new listing; anything playable opens its detail sheet.
function openTarget(item) {
  const browsable = item.folder && item.type !== "Series";
  return browsable ? { kind: "folder", id: item.id, name: item.name } : { kind: "item", id: item.id, name: item.name };
}

function Shelf({ title, items, onOpen }) {
  if (!items?.length) return null;
  return (
    <section className="jf-shelf">
      <h3>{title}</h3>
      <div className="jf-row">
        {items.map((item) => (
          <Tap key={item.id} className="jf-tile wide" onPress={() => onOpen(openTarget(item))}>
            <Poster item={item} wide />
            <span className="jf-name">{item.type === "Episode" ? item.series || item.name : item.name}</span>
            <span className="jf-sub">{item.type === "Episode" ? `S${item.season}:E${item.index} · ${item.name}` : subLine(item)}</span>
          </Tap>
        ))}
      </div>
    </section>
  );
}

function Grid({ items, onOpen }) {
  const listStyle = items.length && items.every((i) => i.type === "Episode");
  if (listStyle) {
    return (
      <ol className="jf-list">
        {items.map((item) => (
          <li key={item.id}>
            <Tap className="jf-list-item" onPress={() => onOpen(openTarget(item))}>
              <Poster item={item} wide />
              <span className="jf-list-text">
                <span className="jf-name">
                  {item.index != null ? `${item.index}. ` : ""}
                  {item.name}
                </span>
                <span className="jf-sub">
                  {[item.runtime ? `${item.runtime} min` : null, item.played ? "Watched" : item.progress ? `${item.progress}% watched` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Tap>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <div className="jf-grid">
      {items.map((item) => (
        <Tap key={item.id} className={`jf-tile${item.wide ? " wide" : ""}`} onPress={() => onOpen(openTarget(item))}>
          <Poster item={item} wide={item.wide} />
          <span className="jf-name">{item.name}</span>
          <span className="jf-sub">{subLine(item)}</span>
        </Tap>
      ))}
    </div>
  );
}

function ItemSheet({ item, action, onOpen }) {
  const canResume = item.resumeTicks > 0 && !item.played;
  const meta = [item.year, item.runtime ? `${item.runtime} min` : null, item.officialRating].filter(Boolean);
  return (
    <div className="jf-item">
      {item.backdrop && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="jf-backdrop" src={item.backdrop} alt="" />
      )}
      <div className="jf-item-head">
        <Poster item={item} wide={item.type === "Episode"} />
        <div className="jf-item-meta">
          <div className="jf-item-title">{item.name}</div>
          {item.type === "Episode" && item.series && (
            <div className="jf-sub">
              {item.series} · S{item.season}:E{item.index}
            </div>
          )}
          <div className="jf-sub">
            {meta.join(" · ")}
            {item.rating ? (
              <>
                {meta.length ? " · " : ""}
                <FontAwesomeIcon icon={faStar} className="jf-star" /> {item.rating}
              </>
            ) : null}
          </div>
          {item.genres?.length > 0 && <div className="jf-sub">{item.genres.slice(0, 3).join(", ")}</div>}
          {item.progress > 0 && !item.played && <div className="jf-sub">{item.progress}% watched</div>}
        </div>
      </div>

      <div className="jf-actions">
        <Tap className="play-main" onPress={() => action("play", { value: { id: item.id } })}>
          <FontAwesomeIcon icon={faPlay} /> {canResume ? "Resume" : "Play"}
        </Tap>
        {canResume && (
          <Tap className="chip" onPress={() => action("play", { value: { id: item.id, fromStart: true } })}>
            <FontAwesomeIcon icon={faRotateLeft} /> From start
          </Tap>
        )}
        <Tap className="chip" onPress={() => action("show", { value: item.id })}>
          <FontAwesomeIcon icon={faTv} /> Show on TV
        </Tap>
        {item.folder && (
          <Tap className="chip" onPress={() => onOpen({ kind: "folder", id: item.id, name: item.name })}>
            <FontAwesomeIcon icon={faFolder} /> {item.type === "Series" ? "Seasons" : "Open"}
          </Tap>
        )}
      </div>

      {item.tagline && <p className="jf-tagline">{item.tagline}</p>}
      {item.overview && <p className="jf-overview">{item.overview}</p>}
    </div>
  );
}

export default function JellyfinLibrary({ library, action, onClose }) {
  const { view, depth, data, loading, error, open, back, reset, more } = library;
  const title =
    view.kind === "home" ? "Library" : view.kind === "search" ? `Search: ${view.query}` : data?.parent?.name || data?.name || view.name || "";

  return (
    <section className="card jf-library">
      <div className="jf-bar">
        {depth > 1 ? (
          <Tap className="jf-icon-btn" aria-label="Back" onPress={back}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </Tap>
        ) : (
          <span className="jf-icon-btn ghost">
            <FontAwesomeIcon icon={faCirclePlay} />
          </span>
        )}
        <div className="jf-title">{title}</div>
        {depth > 1 && (
          <Tap className="jf-icon-btn" aria-label="Library home" onPress={() => reset()}>
            <FontAwesomeIcon icon={faHouse} />
          </Tap>
        )}
        {onClose && (
          <Tap className="pill-btn" onPress={onClose}>
            Remote
          </Tap>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {loading && !data && <div className="jf-loading">Loading…</div>}

      {data && view.kind === "home" && (
        <>
          <Shelf title="Continue watching" items={data.resume} onOpen={open} />
          <Shelf title="Next up" items={data.nextUp} onOpen={open} />
          <section className="jf-shelf">
            <h3>Libraries</h3>
            <Grid items={data.libraries} onOpen={open} />
          </section>
        </>
      )}

      {data && (view.kind === "folder" || view.kind === "search") && (
        <>
          {data.items.length === 0 && <div className="jf-loading">Nothing here.</div>}
          <Grid items={data.items} onOpen={open} />
          {view.kind === "folder" && data.items.length < data.total && (
            <Tap className="chip jf-more" onPress={more}>
              {loading ? "Loading…" : `Load more (${data.items.length} of ${data.total})`}
            </Tap>
          )}
        </>
      )}

      {data && view.kind === "item" && <ItemSheet item={data} action={action} onOpen={open} />}
    </section>
  );
}
