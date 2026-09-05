import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";

/**
 * Counts up (or down) to a target number when scrolled into view.
 *
 * Ported from MagicUI's `number-ticker` to plain React. The original uses
 * `motion/react`'s useMotionValue/useSpring/useInView plus Tailwind's `cn`,
 * none of which this project carries. The spring is reproduced by integrating
 * the same equation with the same defaults (stiffness 100, damping 60, mass 1
 * — a damping ratio of 3, so it eases in hard and settles without overshoot).
 *
 * Like the original it writes `textContent` directly rather than setting
 * state, so a 60fps count costs no React renders.
 */
export default function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  decimalPlaces = 0,
  className = "",
  stiffness = 100,
  damping = 60,
  mass = 1,
  ...props
}) {
  const ref = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const format = (n) =>
    Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(n.toFixed(decimalPlaces)));

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const from = direction === "down" ? value : startValue;
    const to = direction === "down" ? startValue : value;

    if (prefersReducedMotion) {
      element.textContent = format(to);
      return undefined;
    }

    element.textContent = format(from);

    let frame = null;
    let timer = null;
    let cancelled = false;

    const run = () => {
      let position = from;
      let velocity = 0;
      let previous = null;

      const step = (now) => {
        if (cancelled) return;
        if (previous === null) previous = now;
        let elapsed = Math.min((now - previous) / 1000, 0.064);
        previous = now;

        // Fixed sub-steps keep the integrator stable across frame rates.
        const h = 1 / 240;
        while (elapsed > 0) {
          const dt = Math.min(h, elapsed);
          const acceleration =
            (-stiffness * (position - to) - damping * velocity) / mass;
          velocity += acceleration * dt;
          position += velocity * dt;
          elapsed -= dt;
        }

        const precision = 0.5 * 10 ** -decimalPlaces;
        const settled =
          Math.abs(to - position) < precision &&
          Math.abs(velocity) / 60 < precision;

        element.textContent = format(settled ? to : position);
        if (!settled) frame = requestAnimationFrame(step);
      };

      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        timer = window.setTimeout(run, delay * 1000);
      },
      { threshold: 0 },
    );
    observer.observe(element);

    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [
    value,
    startValue,
    direction,
    delay,
    decimalPlaces,
    prefersReducedMotion,
    stiffness,
    damping,
    mass,
  ]);

  return (
    <span ref={ref} className={`number-ticker ${className}`.trim()} {...props}>
      {format(startValue)}
    </span>
  );
}
