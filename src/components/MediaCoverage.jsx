import { useEffect, useRef, useState } from "react";

import { contentAsset } from "../lib/content-asset.js";
import { useMedia } from "../lib/content-store.jsx";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import "./MediaCoverage.css";

const pad = (n) => String(n).padStart(2, "0");

export default function MediaCoverage({ number, label }) {
  const MEDIA_COVERAGE = useMedia();
  const railRef = useRef(null);
  const frameRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const count = MEDIA_COVERAGE.length;
  const next = MEDIA_COVERAGE[(activeIndex + 1) % count];

  // Follow manual scrolling so the counter and the "next up" hint stay true.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const onScroll = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (!rail.clientWidth) return;
        setActiveIndex(
          Math.min(count - 1, Math.max(0, Math.round(rail.scrollLeft / rail.clientWidth))),
        );
      });
    };

    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      rail.removeEventListener("scroll", onScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [count]);

  const goTo = (index) => {
    const rail = railRef.current;
    if (!rail) return;
    // Wraps, so the "next up" control always has somewhere to go.
    const target = (index + count) % count;
    rail.scrollTo({
      left: target * rail.clientWidth,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    setActiveIndex(target);
  };

  const onKeyDown = (event) => {
    const keys = { ArrowRight: activeIndex + 1, ArrowLeft: activeIndex - 1, Home: 0, End: count - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    goTo(keys[event.key]);
  };

  return (
    <div className="mv">
      <ul
        className="mv-rail"
        ref={railRef}
        tabIndex={0}
        aria-label="Media coverage. Use the left and right arrow keys to change slides."
        onKeyDown={onKeyDown}
      >
        {MEDIA_COVERAGE.map((item, index) => (
          <li
            className="mv-slide"
            key={item.id}
            data-active={index === activeIndex || undefined}
          >
            <img
              className="mv-media"
              src={contentAsset(item.background.src)}
              alt={item.background.alt}
              loading={index === 0 ? "eager" : "lazy"}
            />

            <p className="mv-label">
              <span className="mv-label-no">{number}.</span> {label}
            </p>

            <div className="mv-copy">
              <h4 className="mv-outlet">{item.outlet}</h4>
              <p className="mv-text">{item.copy}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mv-controls">
        <p className="mv-count" aria-live="polite">
          {pad(activeIndex + 1)}
          <span aria-hidden="true"> / </span>
          <span className="visually-hidden">of </span>
          {pad(count)}
        </p>

        {/* Names what is coming rather than just pointing at it. */}
        <button className="mv-next" type="button" onClick={() => goTo(activeIndex + 1)}>
          <span className="mv-next-label">Next</span>
          <span className="mv-next-outlet">{next.outlet}</span>
          <span className="mv-next-arrow" aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
