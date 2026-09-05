import { useEffect, useRef, useState } from "react";

import { contentAsset } from "../lib/content-asset.js";
import { useMilestones } from "../lib/content-store.jsx";
import { useInView } from "../hooks/useInView.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import NumberTicker from "./NumberTicker.jsx";
import "./StreamingMilestones.css";

/** Same tuning as the music section — see the note there. */
const COUNT_SPRING = { stiffness: 120, damping: 24 };

/** `kind` in the content file picks one of the four slide layouts. */
const KIND_CLASS = {
  figures: "sm-slide--release",
  mark: "sm-slide--platform",
  blend: "sm-slide--lason",
  artwork: "sm-slide--alice",
};

const pad = (n) => String(n).padStart(2, "0");

function Backdrop({ image }) {
  if (!image?.src) return null;

  return (
    <img
      className="sm-backdrop"
      src={contentAsset(image.src)}
      alt={image.alt}
      width={image.width || undefined}
      height={image.height || undefined}
    />
  );
}

function Art({ image, className }) {
  if (!image?.src) return null;

  return (
    <img
      className={className}
      src={contentAsset(image.src)}
      alt={image.alt}
      width={image.width || undefined}
      height={image.height || undefined}
    />
  );
}

function Figures({ figures }) {
  if (!figures?.length) return null;

  return (
    <ul className="sm-stats">
      {figures.map((figure, index) => (
        <li className="sm-stat" key={figure.id} style={{ "--i": index }}>
          <span className="sm-value">
            <NumberTicker
              className="sm-number-ticker"
              value={figure.value}
              delay={0.32 + index * 0.12}
              {...COUNT_SPRING}
            />
            {figure.suffix}
          </span>
          <span className="sm-track">{figure.track}</span>
          <span className="sm-metric-leading">{figure.metric.split(" ")[0]}</span>
          <span className="sm-metric-trailing">
            {figure.metric.split(" ").slice(1).join(" ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Slide({ slide, active, label }) {
  const className = `sm-slide ${KIND_CLASS[slide.kind] || KIND_CLASS.mark}`;

  // The blended card sits outside `.sm-inner` on purpose: that element carries
  // a z-index and so a stacking context, which would confine the screen blend
  // and stop it reaching the footage behind.
  return (
    <article
      className={className}
      data-active={active || undefined}
      data-tone={slide.tone}
      aria-label={slide.title}
    >
      <Backdrop image={slide.backdrop} />

      {slide.kind === "blend" && <Art image={slide.art} className="sm-card sm-card--blend" />}

      <div className="sm-inner">
        {label}

        {slide.kind === "figures" && (
          <>
            <Art image={slide.art} className="sm-card" />
            <Figures figures={slide.figures} />
          </>
        )}

        {slide.kind === "blend" && slide.copy && <p className="sm-figure">{slide.copy}</p>}

        {(slide.kind === "mark" || slide.kind === "artwork") && (
          <div className="sm-combined">
            <Art
              image={slide.art}
              className={slide.kind === "artwork" ? "sm-artwork" : "sm-logo"}
            />
            {slide.copy && <p className="sm-combined-copy">{slide.copy}</p>}
          </div>
        )}
      </div>
    </article>
  );
}

export default function StreamingMilestones({ number }) {
  const { label: MILESTONES_LABEL, slides: MILESTONE_SLIDES } = useMilestones();
  const [ref, inView] = useInView({ threshold: 0.3 });
  const galleryRef = useRef(null);
  const frameRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const count = MILESTONE_SLIDES.length;

  // Follow manual scrolling so the counter stays truthful.
  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return undefined;

    const handleScroll = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        if (!gallery.clientWidth) return;
        setActiveIndex(
          Math.min(count - 1, Math.max(0, Math.round(gallery.scrollLeft / gallery.clientWidth))),
        );
      });
    };

    gallery.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      gallery.removeEventListener("scroll", handleScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [count]);

  const goTo = (index) => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const next = Math.min(count - 1, Math.max(0, index));
    gallery.scrollTo({
      left: next * gallery.clientWidth,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    setActiveIndex(next);
  };

  const handleKeyDown = (event) => {
    const keys = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      Home: 0,
      End: count - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    goTo(keys[event.key]);
  };

  const label = (
    <p className="sm-label">
      <span className="sm-label-no">{number}.</span> {MILESTONES_LABEL}
    </p>
  );

  return (
    <div
      className="sm"
      ref={ref}
      data-visible={inView || undefined}
      // The pagination sits outside the rail, so it cannot inherit the active
      // slide's colour — it reads that slide's tone instead.
      data-tone={MILESTONE_SLIDES[activeIndex]?.tone || "dark"}
    >
      <div
        className="sm-gallery"
        ref={galleryRef}
        tabIndex={0}
        aria-label="Streaming milestones. Use the left and right arrow keys to change slides."
        onKeyDown={handleKeyDown}
      >
        {MILESTONE_SLIDES.map((slide, index) => (
          <Slide
            key={slide.id}
            slide={slide}
            active={activeIndex === index}
            label={label}
          />
        ))}
      </div>

      <div className="sm-pagination" aria-label="Streaming milestones pagination">
        <button
          className="sm-pagination-button"
          type="button"
          onClick={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
        >
          Previous
        </button>

        <p className="sm-pagination-count" aria-live="polite">
          {pad(activeIndex + 1)} / {pad(count)}
        </p>

        <button
          className="sm-pagination-button"
          type="button"
          onClick={() => goTo(activeIndex + 1)}
          disabled={activeIndex === count - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
