"use client";

import { faFilm, faTvAlt } from "@fortawesome/free-solid-svg-icons";
import StreamingPanel from "./StreamingPanel";

const PAGE_LABELS = {
  home: "Home",
  browse: "Browse",
  detail: "Title",
  search: "Search results",
  mystuff: "My Stuff",
  player: "Watching",
};

const SECTIONS = [
  { value: "movies", label: "Movies", icon: faFilm },
  { value: "tv", label: "TV shows", icon: faTvAlt },
];

export default function PrimePanel() {
  return <StreamingPanel app="prime" appName="Prime Video" audioLabel="Prime" pageLabels={PAGE_LABELS} sections={SECTIONS} />;
}
