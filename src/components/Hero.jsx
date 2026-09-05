import { useEffect, useRef, useState } from "react";

import { asset } from "../assets.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import ExploreButton from "./ExploreButton.jsx";
import RoleList from "./RoleList.jsx";
import SectionNav from "./SectionNav.jsx";

const NAV_ID = "site-nav";

/** Fallback in case `transitionend` never arrives (interrupted paint, etc.). */
const LEAVE_TIMEOUT_MS = 700;

/**
 * The hero owns one small state machine:
 *
 *   intro → leaving → nav
 *
 * "leaving" fades the tagline and Explore button out; "nav" unmounts them and
 * reveals the section links. Under reduced motion the middle step is skipped.
 * The portrait and role line are outside the machine and never move.
 */
export default function Hero() {
  const [phase, setPhase] = useState("intro");
  const [focusNavigation, setFocusNavigation] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const timerRef = useRef(null);

  const revealed = phase === "nav";

  const handleExplore = (event) => {
    if (phase !== "intro") return;
    // Pointer users should see the clean reference composition after reveal;
    // keyboard activation keeps focus moving into the newly visible nav.
    setFocusNavigation(event.detail === 0);
    setPhase(prefersReducedMotion ? "nav" : "leaving");
  };

  // Safety net: advance even if the transition never reports finishing.
  useEffect(() => {
    if (phase !== "leaving") return undefined;

    timerRef.current = window.setTimeout(() => setPhase("nav"), LEAVE_TIMEOUT_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [phase]);

  const handleIntroTransitionEnd = (event) => {
    // Ignore transitions bubbling up from the button, and the paired
    // `transform` transition on this same element.
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "opacity") return;

    window.clearTimeout(timerRef.current);
    setPhase("nav");
  };

  return (
    <section className="hero" aria-labelledby="page-title">
      <div className="hero-stage">
        <h1 className="hero-title" id="page-title">
          artist profile [ MMONN ]
        </h1>

        <figure className="hero-figure">
          <img
            className="hero-portrait"
            src={asset("hero-image-v2.svg")}
            alt="Black-and-white magazine-cover portrait of MMONN in a dark suit and tie, looking over one shoulder."
            width="409"
            height="631"
          />
          <figcaption className="hero-roles">
            <RoleList />
          </figcaption>
        </figure>

        {!revealed && (
          <div
            className="hero-intro"
            data-state={phase === "leaving" ? "leaving" : undefined}
            onTransitionEnd={handleIntroTransitionEnd}
          >
            <img
              className="hero-tagline"
              src={asset("when-emotion-beceome-sound.svg")}
              alt="Where emotion becomes sound."
              width="761"
              height="47"
            />

            <ExploreButton
              controls={NAV_ID}
              expanded={revealed}
              onActivate={handleExplore}
            />
          </div>
        )}

        <SectionNav
          id={NAV_ID}
          revealed={revealed}
          shouldFocusFirstLink={focusNavigation}
        />
      </div>
    </section>
  );
}
