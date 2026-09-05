import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tracks the user's motion preference and keeps following it, so a change made
 * after load is respected on the next interaction rather than only at mount.
 */
export function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const onChange = (event) => setPrefersReducedMotion(event.matches);

    setPrefersReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReducedMotion;
}
