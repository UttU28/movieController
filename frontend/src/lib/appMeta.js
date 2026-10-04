"use client";

import { faFilm, faTvAlt } from "@fortawesome/free-solid-svg-icons";

// Per-app bits the panels and the bubble's extra-buttons both need: the
// volume-button prefix and the two section shortcuts.
export const AUDIO_LABELS = { youtube: "YT", prime: "Prime", netflix: "NF", viki: "Viki", jellyfin: "JF" };

export const SECTIONS = {
  prime: [
    { value: "movies", label: "Movies", icon: faFilm },
    { value: "tv", label: "TV shows", icon: faTvAlt },
  ],
  netflix: [
    { value: "shows", label: "Shows", icon: faTvAlt },
    { value: "movies", label: "Movies", icon: faFilm },
  ],
  viki: [
    { value: "shows", label: "Shows", icon: faTvAlt },
    { value: "movies", label: "Movies", icon: faFilm },
  ],
};
