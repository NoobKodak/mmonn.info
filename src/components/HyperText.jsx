import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";

const DEFAULT_CHARACTER_SET = Object.freeze(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
);

const LETTER = /[a-z]/i;
const randomInt = (max) => Math.floor(Math.random() * max);

/**
 * Scrambles letters before revealing the final text.
 *
 * Ported from MagicUI's `hyper-text` to plain React. The original leans on
 * Tailwind, `motion` and `cn`, none of which this project uses — and its
 * `motion.span` wrappers carry no animation props, so the effect is pure
 * requestAnimationFrame either way. Three deliberate changes:
 *
 *  - Renders one text node instead of a <span> per character. A body
 *    paragraph here is ~430 characters; that would be 430 elements
 *    reconciled every frame.
 *  - Only letters scramble. Spaces, punctuation and digits are held, which
 *    keeps word boundaries — and so the line breaks — roughly in place.
 *  - The real text is exposed to assistive tech while the visible text is
 *    gibberish, and the box height is pinned for the duration so the page
 *    below cannot jump.
 */
export default function HyperText({
  children,
  className = "",
  duration = 1000,
  delay = 0,
  as: Tag = "p",
  startOnView = true,
  animateOnHover = true,
  characterSet = DEFAULT_CHARACTER_SET,
  ...props
}) {
  const text = children;
  const [display, setDisplay] = useState(text);
  const [isAnimating, setIsAnimating] = useState(false);
  const [lockedHeight, setLockedHeight] = useState(null);
  const elementRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const start = () => {
    if (!animateOnHover || isAnimating || prefersReducedMotion) return;
    setIsAnimating(true);
  };

  // Kick off on mount, or when the block scrolls into view.
  useEffect(() => {
    if (prefersReducedMotion) return undefined;

    if (!startOnView) {
      const timer = window.setTimeout(() => setIsAnimating(true), delay);
      return () => window.clearTimeout(timer);
    }

    const element = elementRef.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        window.setTimeout(() => setIsAnimating(true), delay);
        observer.disconnect();
      },
      { threshold: 0.1, rootMargin: "-15% 0px -15% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [delay, startOnView, prefersReducedMotion]);

  // The scramble itself.
  useEffect(() => {
    if (!isAnimating) return undefined;

    // Hold the resting height so surrounding content cannot shift while the
    // substituted glyphs change the line wrapping.
    if (elementRef.current) {
      setLockedHeight(elementRef.current.getBoundingClientRect().height);
    }

    let frame = null;
    const startedAt = performance.now();
    const total = text.length;

    const step = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const revealed = progress * total;

      let next = "";
      for (let i = 0; i < total; i += 1) {
        const character = text[i];
        next +=
          i <= revealed || !LETTER.test(character)
            ? character
            : characterSet[randomInt(characterSet.length)];
      }
      setDisplay(next);

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setIsAnimating(false);
        setLockedHeight(null);
      }
    };

    frame = requestAnimationFrame(step);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [isAnimating, text, duration, characterSet]);

  // Keep the text honest if the motion preference changes mid-flight.
  useEffect(() => {
    if (!prefersReducedMotion) return;
    setIsAnimating(false);
    setLockedHeight(null);
    setDisplay(text);
  }, [prefersReducedMotion, text]);

  return (
    <Tag
      ref={elementRef}
      className={`hyper-text ${className}`.trim()}
      style={lockedHeight ? { minHeight: `${lockedHeight}px` } : undefined}
      onMouseEnter={start}
      {...props}
    >
      {isAnimating ? (
        <>
          <span className="visually-hidden">{text}</span>
          <span aria-hidden="true">{display}</span>
        </>
      ) : (
        text
      )}
    </Tag>
  );
}
