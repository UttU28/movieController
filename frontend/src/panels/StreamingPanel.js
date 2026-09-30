"use client";

import {
  faArrowLeft,
  faClosedCaptioning,
  faExpand,
  faForwardFast,
  faForwardStep,
  faHouse,
  faLocationCrosshairs,
  faPause,
  faPlay,
  faRotate,
  faRotateLeft,
  faRotateRight,
  faTv,
} from "@fortawesome/free-solid-svg-icons";
import AudioRow from "../components/AudioRow";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import DPad from "../components/DPad";
import MediaNowShowing from "../components/MediaNowShowing";
import RemoteButton from "../components/RemoteButton";
import SearchBar from "../components/SearchBar";
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

// Remote for a streaming site (Prime Video, Netflix). `sections` are the two
// shortcut buttons at the top right, e.g. Movies and TV shows.
export default function StreamingPanel({ app, appName, audioLabel, pageLabels, sections }) {
  const { state, connected, error, action, search, show } = useRemote(app);
  const player = state?.player;
  useKeyboardRemote(action, KEYS);

  return (
    <>
      {isReady(connected, state) ? (
        <MediaNowShowing state={state} action={action} pageLabels={pageLabels} appName={appName} />
      ) : (
        <ChromeStatus connected={connected} state={state} appName={appName} onShow={show} />
      )}

      {error && <div className="error">{error}</div>}

      <SearchBar onSearch={search} placeholder={`Search ${appName}`} />

      <div className="row five">
        <RemoteButton icon={faArrowLeft} label="Back" onPress={() => action("back")} />
        <RemoteButton icon={faHouse} label="Home" onPress={() => action("section", { value: "home" })} />
        <RemoteButton icon={faLocationCrosshairs} label="Focus" onPress={() => action("focus")} />
        {sections.map((s) => (
          <RemoteButton key={s.value} icon={s.icon} label={s.label} onPress={() => action("section", { value: s.value })} />
        ))}
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
        <RemoteButton icon={faForwardStep} label="Next ep" onPress={() => action("next")} />
      </div>

      <AudioRow appLabel={audioLabel} onAppUp={() => action("volumeUp")} onAppDown={() => action("volumeDown")} />

      <div className="row five">
        <span className="rbtn blank" aria-hidden="true" />
        <RemoteButton icon={faClosedCaptioning} label="Subtitles" onPress={() => action("subtitles")} />
        <RemoteButton icon={faExpand} label="Full" active={!!player?.fullscreen} onPress={() => action("fullscreen")} />
        <RemoteButton icon={faRotate} label="Reload" onPress={() => action("reload")} />
        <RemoteButton icon={faTv} label="TV" active={!!state?.tvMode} onPress={() => action("tvMode")} />
      </div>
    </>
  );
}
