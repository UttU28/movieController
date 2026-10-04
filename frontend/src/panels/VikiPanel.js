"use client";

import { SECTIONS } from "../lib/appMeta";
import StreamingPanel from "./StreamingPanel";

const PAGE_LABELS = {
  home: "Home",
  browse: "Browse",
  detail: "Title",
  search: "Search results",
  mylist: "Watchlist",
  login: "Sign in needed",
  loading: "Loading",
  player: "Watching",
};

// Viki asks for a login before any episode plays.
const NOTICES = {
  login: { title: "Log in to Viki on the TV", sub: "Once, with the laptop trackpad. Back returns to the show." },
};

export default function VikiPanel() {
  return (
    <StreamingPanel
      app="viki"
      appName="Viki"
      audioLabel="Viki"
      pageLabels={PAGE_LABELS}
      sections={SECTIONS.viki}
      notices={NOTICES}
    />
  );
}
