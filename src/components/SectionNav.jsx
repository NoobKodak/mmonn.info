import { useEffect, useRef } from "react";

import { useSections } from "../lib/content-store.jsx";

/**
 * Stays mounted and toggles `hidden` rather than mounting on reveal: it keeps
 * the Explore button's `aria-controls` pointing at a real element, and the
 * staggered entrance is a CSS animation, which browsers start when a box goes
 * from `display: none` to displayed — so no forced-reflow trick is needed.
 */
export default function SectionNav({ id, revealed, shouldFocusFirstLink }) {
  const SECTIONS = useSections();
  const firstLinkRef = useRef(null);

  // The control that was activated is gone, so hand focus to the new links.
  useEffect(() => {
    if (!revealed || !shouldFocusFirstLink) return;
    firstLinkRef.current?.focus({ preventScroll: true });
  }, [revealed, shouldFocusFirstLink]);

  return (
    <nav
      className="hero-nav"
      id={id}
      hidden={!revealed}
      aria-label="Artist profile sections"
    >
      <ul className="nav-list">
        {SECTIONS.map((section, index) => (
          <li
            className={`nav-item nav-item--${section.id}`}
            key={section.id}
            style={{ "--i": index }}
          >
            <a
              className="nav-link"
              href={`#${section.id}`}
              ref={index === 0 ? firstLinkRef : undefined}
            >
              <span className="nav-slash" aria-hidden="true">
                /
              </span>
              <span className="nav-number">{section.number}</span>
              <span className="nav-label">{section.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
