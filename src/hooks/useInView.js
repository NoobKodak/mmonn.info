import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether the referenced element is in the viewport. Unlike the
 * one-shot observers used by NumberTicker and HyperText, this keeps
 * reporting, so a block can fade out again on the way past.
 */
export function useInView({ threshold = 0.25, once = false } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, once]);

  return [ref, inView];
}
