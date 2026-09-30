"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";

export default function SearchBar({ onSearch, placeholder = "Search" }) {
  const [query, setQuery] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    onSearch(q);
    setQuery("");
    e.target.querySelector("input")?.blur();
  };

  return (
    <form className="search" onSubmit={submit}>
      <input
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="submit" aria-label="Search">
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </button>
    </form>
  );
}
