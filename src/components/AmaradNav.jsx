import { useEffect, useRef } from "react";

import NavBack from "./NavBack.jsx";

/**
 * Mirrors SectionNav.jsx: same numbered /01 treatment, same stay-mounted
 * -and-toggle-hidden approach — but toggled independently by the Amarad
 * button rather than the one-way intro → nav phase machine, so it keeps its
 * own outside-click/Escape handling instead of simply disappearing when
 * revealed. On desktop it reuses the exact `nav-item--about` / `--music` /
 * `--contact` scatter slots so the reveal lands on the same three spots as
 * the reference composition.
 */
const LINKS = [
  ["01", "Watch music video", "https://www.youtube.com/watch?v=BEWqXUi_P4w", "about"],
  ["02", "Spotify", "https://open.spotify.com/album/5WfzKtkIMjDAlPgQg2bQq8", "music"],
  ["03", "Other music platforms", "https://ditto.fm/amarad", "contact"],
];

export default function AmaradNav({ id, open, onClose, toggleId }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const isInside = (target) =>
      containerRef.current?.contains(target) ||
      document.getElementById(toggleId)?.contains(target);

    const onPointerDown = (event) => {
      if (!isInside(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
      document.getElementById(toggleId)?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, toggleId]);

  return (
    <nav
      className="hero-nav amarad-nav"
      id={id}
      ref={containerRef}
      hidden={!open}
      aria-label="Amarad listening links"
    >
      <ul className="nav-list">
        <NavBack onActivate={onClose} />
        {LINKS.map(([number, label, url, slot], index) => (
          <li
            className={`nav-item nav-item--${slot} amarad-item`}
            key={url}
            style={{ "--i": index + 1 }}
          >
            <a
              className="nav-link amarad-link"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="nav-slash" aria-hidden="true">
                /
              </span>
              <span className="nav-number">{number}</span>
              <span className="nav-label">{label}</span>
              <span className="material-symbols-outlined amarad-arrow" aria-hidden="true">
                arrow_outward
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
