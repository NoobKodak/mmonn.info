import { useEffect, useRef, useState } from "react";

import { publicAsset } from "../assets.js";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import MajorCollaborations from "./MajorCollaborations.jsx";
import MediaCoverage from "./MediaCoverage.jsx";
import StreamingMilestones from "./StreamingMilestones.jsx";
import "./HighlightsSection.css";

const HIGHLIGHT_CATEGORIES = [
  { id: "major-collaborations", number: "01", label: "Major collaborations" },
  { id: "streaming-milestones", number: "02", label: "Streaming milestones" },
  { id: "performances", number: "03", label: "Performances" },
  { id: "media-coverage", number: "04", label: "Media coverage" },
];

// Each clip in public/performance becomes one full-bleed, horizontally
// paginated Performance slide. Keep this list in the intended viewing order.
const PERFORMANCE_SLIDES = [
  {
    id: "performance-01",
    src: publicAsset("performance/_1.gif"),
    label: "Performance visual 01",
  },
  {
    id: "performance-02",
    src: publicAsset("performance/_2.gif"),
    label: "Performance visual 02",
  },
  {
    id: "performance-03",
    src: publicAsset("performance/_3.gif"),
    label: "Performance visual 03",
  },
  {
    id: "performance-04",
    src: publicAsset("performance/_4.gif"),
    label: "Performance visual 04",
  },
];

const pad = (number) => String(number).padStart(2, "0");

function PerformanceGallery() {
  const galleryRef = useRef(null);
  const frameRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const hasMultipleSlides = PERFORMANCE_SLIDES.length > 1;

  const updatePageFromScroll = () => {
    const gallery = galleryRef.current;
    if (!gallery?.clientWidth) return;

    setActiveIndex(
      Math.min(
        PERFORMANCE_SLIDES.length - 1,
        Math.max(0, Math.round(gallery.scrollLeft / gallery.clientWidth)),
      ),
    );
  };

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return undefined;

    const handleScroll = () => {
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        updatePageFromScroll();
      });
    };

    gallery.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      gallery.removeEventListener("scroll", handleScroll);
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const goTo = (index) => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const nextIndex = Math.min(
      PERFORMANCE_SLIDES.length - 1,
      Math.max(0, index),
    );

    gallery.scrollTo({
      left: nextIndex * gallery.clientWidth,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    setActiveIndex(nextIndex);
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(activeIndex + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(activeIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(PERFORMANCE_SLIDES.length - 1);
    }
  };

  return (
    <div className="performance-gallery-shell">
      <div
        className="performance-gallery"
        ref={galleryRef}
        tabIndex={0}
        aria-label="Performances gallery. Use the left and right arrow keys to change slides."
        onKeyDown={handleKeyDown}
      >
        {PERFORMANCE_SLIDES.map((slide) => (
          <article
            className="performance-slide"
            key={slide.id}
            aria-label={slide.label}
          >
            <img
              className="performance-slide-media"
              src={slide.src}
              alt=""
              aria-hidden="true"
            />
          </article>
        ))}
      </div>

      <div className="performance-pagination" aria-label="Performance gallery pagination">
        {hasMultipleSlides && (
          <button
            className="performance-pagination-button"
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
          >
            Previous
          </button>
        )}

        <p className="performance-pagination-count" aria-live="polite">
          {pad(activeIndex + 1)} / {pad(PERFORMANCE_SLIDES.length)}
        </p>

        {hasMultipleSlides && (
          <button
            className="performance-pagination-button"
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === PERFORMANCE_SLIDES.length - 1}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function HighlightPanel({ category, onBack }) {
  const titleRef = useRef(null);
  const isPerformances = category.id === "performances";
  const isStreamingMilestones = category.id === "streaming-milestones";
  const isCollaborations = category.id === "major-collaborations";
  const isMedia = category.id === "media-coverage";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={`highlights-panel${isPerformances ? " highlights-panel--performances" : ""}${isStreamingMilestones ? " highlights-panel--streaming" : ""}${isCollaborations ? " highlights-panel--collaborations" : ""}${isMedia ? " highlights-panel--media" : ""}`}
      aria-labelledby={`highlights-panel-title-${category.id}`}
    >
      <button className="highlights-back" type="button" onClick={onBack}>
        All highlights
      </button>

      <h3
        className={`highlights-panel-title${isStreamingMilestones || isCollaborations || isMedia ? " visually-hidden" : ""}`}
        id={`highlights-panel-title-${category.id}`}
        ref={titleRef}
        tabIndex={-1}
      >
        <span aria-hidden="true">{category.number}.</span> {category.label}
      </h3>

      {isCollaborations && (
        <MajorCollaborations number={category.number} label={category.label} />
      )}
      {isMedia && (
        <MediaCoverage number={category.number} label={category.label} />
      )}
      {isStreamingMilestones && <StreamingMilestones number={category.number} />}
      {isPerformances && <PerformanceGallery />}
    </div>
  );
}

export default function HighlightsSection({ id, label }) {
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const sectionRef = useRef(null);
  const lastTriggerRef = useRef(null);
  const activeCategory = HIGHLIGHT_CATEGORIES.find(
    (category) => category.id === activeCategoryId,
  );

  useEffect(() => {
    if (!activeCategoryId) return undefined;

    // A category is an in-page view. Align it immediately so a page-level
    // anchor animation cannot leave the full-screen panel partially cropped.
    const frame = window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategoryId]);

  useEffect(() => {
    let frame;
    const alignHashTarget = () => {
      if (window.location.hash !== `#${id}`) return;
      frame = window.requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      });
    };

    alignHashTarget();
    window.addEventListener("hashchange", alignHashTarget);
    return () => {
      window.removeEventListener("hashchange", alignHashTarget);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [id]);

  const openCategory = (categoryId, event) => {
    lastTriggerRef.current = event.currentTarget;
    setActiveCategoryId(categoryId);
  };

  const closeCategory = () => {
    setActiveCategoryId(null);
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      lastTriggerRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <section
      className={`highlights${activeCategory ? " highlights--panel-open" : ""}`}
      id={id}
      ref={sectionRef}
      aria-labelledby="highlights-title"
    >
      <h2 className="visually-hidden" id="highlights-title">
        {label}
      </h2>

      {activeCategory ? (
        <HighlightPanel category={activeCategory} onBack={closeCategory} />
      ) : (
        <nav className="highlights-index" aria-label="Highlights categories">
          <ul className="highlights-menu">
            {HIGHLIGHT_CATEGORIES.map((category) => (
              <li
                className={`highlights-menu-item highlights-menu-item--${category.id}`}
                key={category.id}
              >
                <button
                  className="highlights-menu-button"
                  type="button"
                  onClick={(event) => openCategory(category.id, event)}
                >
                  <span className="highlights-menu-number">{category.number}.</span>
                  <span className="highlights-menu-label">{category.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
