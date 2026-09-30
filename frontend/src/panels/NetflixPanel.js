"use client";

import { faFilm, faTvAlt } from "@fortawesome/free-solid-svg-icons";
import StreamingPanel from "./StreamingPanel";

const PAGE_LABELS = {
  profiles: "Who's watching?",
  home: "Home",
  browse: "Browse",
  detail: "Title",
  search: "Search results",
  mylist: "My List",
  player: "Watching",
};

const SECTIONS = [
  { value: "shows", label: "Shows", icon: faTvAlt },
  { value: "movies", label: "Movies", icon: faFilm },
];

export default function NetflixPanel() {
  return <StreamingPanel app="netflix" appName="Netflix" audioLabel="NF" pageLabels={PAGE_LABELS} sections={SECTIONS} />;
}
