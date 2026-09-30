"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChrome, faWindows } from "@fortawesome/free-brands-svg-icons";
import {
  faArrowDown,
  faArrowLeft,
  faArrowRight,
  faArrowRotateLeft,
  faArrowUp,
  faBackward,
  faCalculator,
  faChevronLeft,
  faChevronRight,
  faClone,
  faCopy,
  faCropSimple,
  faDeleteLeft,
  faDesktop,
  faExpand,
  faFileLines,
  faFolderOpen,
  faForward,
  faGear,
  faGripVertical,
  faHandPointer,
  faKeyboard,
  faListCheck,
  faPaperPlane,
  faPaste,
  faPlay,
  faPlus,
  faRepeat,
  faRightLeft,
  faRotate,
  faRotateLeft,
  faTableCellsLarge,
  faTurnDown,
  faVolumeHigh,
  faVolumeLow,
  faVolumeXmark,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import RemoteButton, { buzz } from "../components/RemoteButton";
import Trackpad from "../components/Trackpad";
import usePointerSocket from "../lib/usePointerSocket";
import useRemote from "../lib/useRemote";

const SENS_KEY = "remote.trackpadSensitivity";
const HOTKEYS = [
  { action: "altTab", icon: faRightLeft, label: "Alt+Tab" },
  { action: "desktop", icon: faDesktop, label: "Win+D" },
  { action: "startMenu", icon: faWindows, label: "Start" },
  { action: "taskView", icon: faTableCellsLarge, label: "Task view" },
  { action: "closeWindow", icon: faXmark, label: "Alt+F4" },
  { action: "newTab", icon: faPlus, label: "New tab" },
  { action: "closeTab", icon: faClone, label: "Close tab" },
  { action: "reopenTab", icon: faArrowRotateLeft, label: "Reopen tab" },
  { action: "prevTab", icon: faChevronLeft, label: "Prev tab" },
  { action: "nextTab", icon: faChevronRight, label: "Next tab" },
  { action: "browserBack", icon: faArrowLeft, label: "Back" },
  { action: "browserForward", icon: faArrowRight, label: "Forward" },
  { action: "refresh", icon: faRotate, label: "Refresh" },
  { action: "fullscreenKey", icon: faExpand, label: "F11" },
  { action: "copy", icon: faCopy, label: "Copy" },
  { action: "paste", icon: faPaste, label: "Paste" },
  { action: "undo", icon: faRotateLeft, label: "Undo" },
  { action: "selectAll", icon: faListCheck, label: "Select all" },
  { action: "screenshot", icon: faCropSimple, label: "Snip" },
];

const KEYS = [
  { value: "esc", label: "Esc" },
  { value: "tab", label: "Tab" },
  { value: "backspace", icon: faDeleteLeft, label: "Back" },
  { value: "delete", label: "Del" },
  { value: "enter", icon: faTurnDown, label: "Enter" },
  { value: "left", icon: faArrowLeft },
  { value: "up", icon: faArrowUp },
  { value: "down", icon: faArrowDown },
  { value: "right", icon: faArrowRight },
  { value: "space", label: "Space" },
];

const APPS = [
  { id: "chrome", icon: faChrome, label: "Chrome" },
  { id: "explorer", icon: faFolderOpen, label: "Files" },
  { id: "notepad", icon: faFileLines, label: "Notepad" },
  { id: "calculator", icon: faCalculator, label: "Calculator" },
  { id: "settings", icon: faGear, label: "Settings" },
  { id: "taskManager", icon: faListCheck, label: "Task Mgr" },
];

function TextSend({ placeholder, button, buttonLabel, onSend, autoFocus = false, clearOnSend = true }) {
  const [text, setText] = useState("");
  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text) return;
        onSend(text);
        if (clearOnSend) setText("");
      }}
    >
      <input
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className="send-btn" aria-label={buttonLabel}>
        {button}
      </button>
    </form>
  );
}

export default function LaptopPanel() {
  const { error, action } = useRemote("laptop", { poll: false });
  const { status, send } = usePointerSocket();
  const [sensitivity, setSensitivity] = useState(1.6);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(SENS_KEY));
      if (saved > 0) setSensitivity(saved);
    } catch {}
  }, []);

  const changeSensitivity = (value) => {
    setSensitivity(value);
    try {
      localStorage.setItem(SENS_KEY, String(value));
    } catch {}
  };

  const toggleDrag = () => {
    const next = !dragging;
    setDragging(next);
    send({ t: "d", on: next });
  };

  const typeText = (text) => action("type", { value: text });

  return (
    <div className="laptop">
      <section className="card laptop-status">
        <div className="card-row">
          <span className="page-pill">Laptop control</span>
          <span className={`page-pill muted conn-pill ${status === "open" ? "ok" : "bad"}`}>
            <span className="dot" />
            {status === "open" ? "Trackpad live" : "Trackpad reconnecting…"}
          </span>
        </div>

        <div className="pad-wrap">
          <Trackpad send={send} sensitivity={sensitivity} />
        </div>

        <label className="slider">
          <span>Pointer speed</span>
          <input
            type="range"
            min="0.4"
            max="4"
            step="0.1"
            value={sensitivity}
            onChange={(e) => changeSensitivity(parseFloat(e.target.value))}
          />
          <b>{sensitivity.toFixed(1)}x</b>
        </label>

        <div className="row five">
          <RemoteButton icon={faHandPointer} label="Left" onPress={() => send({ t: "c", b: "left" })} />
          <RemoteButton icon={faRepeat} label="Double" onPress={() => send({ t: "c", b: "left", double: true })} />
          <RemoteButton icon={faHandPointer} label="Right" onPress={() => send({ t: "c", b: "right" })} />
          <RemoteButton icon={faGripVertical} label={dragging ? "Release" : "Drag"} active={dragging} onPress={toggleDrag} />
          <RemoteButton icon={faKeyboard} active={typing} onPress={() => setTyping(!typing)} />
        </div>

        {typing && (
          <TextSend
            placeholder="Type on the laptop…"
            button={<FontAwesomeIcon icon={faPaperPlane} />}
            buttonLabel="Send"
            autoFocus
            onSend={typeText}
          />
        )}
      </section>

      {error && <div className="error">{error}</div>}

      <h2 className="section-title">Keys</h2>
      <div className="row five keys">
        {KEYS.map((k) => (
          <RemoteButton
            key={k.value}
            icon={k.icon}
            label={k.icon ? k.label : undefined}
            text={k.label}
            onPress={() => action("key", { value: k.value })}
          />
        ))}
      </div>

      <h2 className="section-title">Shortcuts</h2>
      <div className="row five">
        {HOTKEYS.map((h) => (
          <RemoteButton
            key={h.label}
            icon={h.icon}
            label={h.label}
            onPress={() => action(h.action, h.value ? { value: h.value } : undefined)}
          />
        ))}
      </div>

      <h2 className="section-title">Sound &amp; media</h2>
      <div className="row six">
        <RemoteButton icon={faVolumeLow} label="Vol -" onPress={() => action("volumeDown")} />
        <RemoteButton icon={faVolumeXmark} label="Mute" onPress={() => action("mute")} />
        <RemoteButton icon={faVolumeHigh} label="Vol +" onPress={() => action("volumeUp")} />
        <RemoteButton icon={faBackward} label="Prev" onPress={() => action("mediaPrev")} />
        <RemoteButton icon={faPlay} label="Play" accent onPress={() => action("mediaPlayPause")} />
        <RemoteButton icon={faForward} label="Next" onPress={() => action("mediaNext")} />
      </div>

      <h2 className="section-title">Open apps</h2>
      <div className="row six">
        {APPS.map((a) => (
          <RemoteButton key={a.id} icon={a.icon} label={a.label} onPress={() => action("openApp", { value: a.id })} />
        ))}
      </div>
      <TextSend
        placeholder="Open any app by name (Start search)"
        button="Open"
        onSend={(name) => {
          buzz();
          action("searchOpen", { value: name });
        }}
      />
    </div>
  );
}
