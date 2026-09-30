"use client";

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
  faPause,
  faPlay,
  faRotate,
  faRotateLeft,
  faRotateRight,
  faTv,
  faWindowMaximize,
} from "@fortawesome/free-solid-svg-icons";
import AudioRow from "../components/AudioRow";
import ChromeStatus, { isReady } from "../components/ChromeStatus";
import DPad from "../components/DPad";
import NowShowing from "../components/NowShowing";
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
  i: "miniplayer",
  j: "seekBack",
  l: "seekForward",
};

export default function YouTubePanel() {
  const { state, connected, error, action, search, show } = useRemote("youtube");
  const player = state?.player;
  useKeyboardRemote(action, KEYS);

  return (
    <>
      {isReady(connected, state) ? (
        <NowShowing state={state} onSkipAd={() => action("skipAd")} />
      ) : (
        <ChromeStatus connected={connected} state={state} appName="YouTube" onShow={show} />
      )}

      {error && <div className="error">{error}</div>}

      <SearchBar onSearch={search} placeholder="Search YouTube" />

      <div className="row five">
        <RemoteButton icon={faArrowLeft} label="Back" onPress={() => action("back")} />
        <RemoteButton icon={faHouse} label="Home" onPress={() => action("home")} />
        <RemoteButton icon={faLocationCrosshairs} label="Focus" onPress={() => action("focus")} />
        <RemoteButton icon={faInfo} label="Mini" onPress={() => action("miniplayer")} />
        <RemoteButton icon={faRotate} label="Reload" onPress={() => action("reload")} />
      </div>

      <DPad onMove={(dir, opts) => action(dir, opts)} onSelect={() => action("select")} />

      <div className="row five">
        <RemoteButton icon={faBackwardStep} label="Prev" onPress={() => action("previous")} />
        <RemoteButton icon={faRotateLeft} label="-10s" onPress={() => action("seekBack")} />
        <RemoteButton
          icon={player && !player.paused ? faPause : faPlay}
          label={player && !player.paused ? "Pause" : "Play"}
          accent
          onPress={() => action("playPause")}
        />
        <RemoteButton icon={faRotateRight} label="+10s" onPress={() => action("seekForward")} />
        <RemoteButton icon={faForwardStep} label="Next" onPress={() => action("next")} />
      </div>

      <AudioRow appLabel="YT" onAppUp={() => action("volumeUp")} onAppDown={() => action("volumeDown")} />

      <div className="row five">
        <RemoteButton icon={faExpand} label="Full" active={!!state?.fullscreen} onPress={() => action("fullscreen")} />
        <RemoteButton icon={faWindowMaximize} label="Theater" onPress={() => action("theater")} />
        <RemoteButton icon={faClosedCaptioning} label="CC" onPress={() => action("captions")} />
        <RemoteButton icon={faGauge} label={player ? `${player.rate}x` : "Speed"} onPress={() => action("speed")} />
        <RemoteButton icon={faTv} label="TV" active={!!state?.tvMode} onPress={() => action("tvMode")} />
      </div>
    </>
  );
}
