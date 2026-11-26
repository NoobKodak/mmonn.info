import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import DiscArtwork from "./DiscArtwork.jsx";
import "./MusicDiscGallery.css";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export default function MusicDiscGallery({ tracks, artistUrl }) {
  const railRef = useRef(null);
  const controllerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const rail = railRef.current;
    const cards = [...rail.children];
    let paintFrame = null;
    let motionFrame = null;
    let target = rail.scrollLeft;
    let lastScroll = rail.scrollLeft;
    let lastPaint = performance.now();
    let speed = 0;
    let pointer = 0;
    let drag = null;
    let suppressClick = false;
    let active = 0;

    // Layout is stable during a swipe; only refresh these measurements on resize.
    let railWidth = rail.clientWidth;
    let geometry = cards.map((card) => ({ left: card.offsetLeft, width: card.offsetWidth }));
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const maxScroll = () => Math.max(0, rail.scrollWidth - rail.clientWidth);
    const paint = () => {
      paintFrame = null;
      const now = performance.now();
      const elapsed = Math.max(16, now - lastPaint);
      speed = clamp((rail.scrollLeft - lastScroll) / elapsed, -3, 3);
      lastScroll = rail.scrollLeft;
      lastPaint = now;
      let nearest = 0;
      let distance = Infinity;
      const mobile = railWidth < 700 || coarsePointer.matches;
      const scrollLeft = rail.scrollLeft;
      for (const [index, card] of cards.entries()) {
        const { left, width } = geometry[index];
        const offset = (left + width / 2 - scrollLeft - railWidth / 2) / (width * 0.84);
        if (Math.abs(offset) < distance) { distance = Math.abs(offset); nearest = index; }
        // Offscreen discs need no style work. Native scrolling composites the
        // mobile artwork without continuously rerasterizing its masked layers.
        if (mobile || Math.abs(offset) > 2.8) continue;
        const position = clamp(offset, -2.4, 2.4);
        card.style.setProperty("--disc-lift", `${reducedMotion ? 0 : -position * (mobile ? 30 : 66)}px`);
        card.style.setProperty("--disc-scale", reducedMotion ? "1" : String(1.02 + clamp(position, -1.8, 1.8) * 0.1));
        card.style.setProperty("--disc-turn", `${reducedMotion ? 0 : -17 + position * 4 + speed * 2 + pointer * 2}deg`);
        card.style.setProperty("--disc-yaw", `${reducedMotion ? 0 : -24 + pointer * 3 - speed * 2}deg`);
        card.style.zIndex = String(20 - Math.min(19, Math.round(Math.abs(offset) * 3)));
      }
      if (nearest !== active) { active = nearest; setActiveIndex(nearest); }
    };
    const schedulePaint = () => {
      if (paintFrame === null) paintFrame = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (motionFrame !== null) cancelAnimationFrame(motionFrame);
      motionFrame = null;
      target = rail.scrollLeft;
    };
    const go = (value) => {
      target = clamp(value, 0, maxScroll());
      if (reducedMotion) { rail.scrollLeft = target; schedulePaint(); return; }
      if (motionFrame !== null) return;
      let then = performance.now();
      const step = (now) => {
        const alpha = 1 - Math.exp(-Math.min(64, now - then) / 85);
        then = now;
        const remaining = target - rail.scrollLeft;
        if (Math.abs(remaining) < 0.7) {
          rail.scrollLeft = target;
          motionFrame = null;
          schedulePaint();
          return;
        }
        rail.scrollLeft += remaining * alpha;
        motionFrame = requestAnimationFrame(step);
      };
      motionFrame = requestAnimationFrame(step);
    };
    const align = (index) => {
      const card = cards[clamp(index, 0, cards.length - 1)];
      go(card.offsetLeft + card.offsetWidth / 2 - rail.clientWidth / 2);
    };
    controllerRef.current = { move: (direction) => align(active + direction), align };

    const wheel = (event) => {
      if (event.ctrlKey) return;
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const delta = raw * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1);
      if (!delta || (delta < 0 && rail.scrollLeft <= 1) || (delta > 0 && rail.scrollLeft >= maxScroll() - 1)) return;
      event.preventDefault();
      go((motionFrame === null ? rail.scrollLeft : target) + delta);
    };
    const pointerDown = (event) => {
      stop();
      suppressClick = false;
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, left: rail.scrollLeft, lastX: event.clientX, time: performance.now(), velocity: 0, moved: false };
    };
    const pointerMove = (event) => {
      if (!drag) {
        if (event.pointerType === "mouse" && !reducedMotion) {
          const rect = rail.getBoundingClientRect();
          pointer = clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1);
          schedulePaint();
        }
        return;
      }
      if (event.pointerId !== drag.id) return;
      if (!drag.moved && Math.abs(event.clientX - drag.x) < 6) return;
      if (!drag.moved) { drag.moved = true; rail.setPointerCapture(event.pointerId); rail.dataset.dragging = "true"; }
      event.preventDefault();
      const now = performance.now();
      drag.velocity = clamp((drag.lastX - event.clientX) / Math.max(16, now - drag.time), -3, 3);
      drag.lastX = event.clientX;
      drag.time = now;
      rail.scrollLeft = drag.left + drag.x - event.clientX;
      suppressClick = true;
    };
    const pointerUp = (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      const finished = drag;
      drag = null;
      delete rail.dataset.dragging;
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
      if (finished.moved && event.type !== "pointercancel") go(rail.scrollLeft + (performance.now() - finished.time < 100 ? finished.velocity : 0) * 130);
    };
    const lostCapture = () => { drag = null; delete rail.dataset.dragging; };
    const pointerLeave = () => { pointer = 0; schedulePaint(); };
    const click = (event) => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; }
    };
    const focus = (event) => {
      const index = cards.findIndex((card) => card.contains(event.target));
      if (index >= 0) align(index);
    };
    let measuredWidth = 0;
    const resize = () => {
      // Mobile browser chrome changes viewport height during scrolling. Never
      // cancel native momentum or snap the release for a height-only resize.
      const nextWidth = rail.clientWidth;
      if ((nextWidth < 700 || coarsePointer.matches) && Math.abs(nextWidth - measuredWidth) < 1) return;
      measuredWidth = nextWidth;
      // Fullscreen changes both card geometry and rail width. Keep the current
      // release centered rather than retaining a stale pixel scroll offset.
      stop();
      lostCapture();
      rail.style.setProperty("--rail-width", `${rail.clientWidth}px`);
      railWidth = rail.clientWidth;
      geometry = cards.map((card) => ({ left: card.offsetLeft, width: card.offsetWidth }));
      const card = cards[active];
      rail.scrollLeft = clamp(card.offsetLeft + card.offsetWidth / 2 - rail.clientWidth / 2, 0, maxScroll());
      target = lastScroll = rail.scrollLeft;
      speed = 0;
      schedulePaint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(rail);
    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", resize);
    rail.addEventListener("scroll", schedulePaint, { passive: true });
    rail.addEventListener("wheel", wheel, { passive: false });
    rail.addEventListener("pointerdown", pointerDown);
    rail.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp, true);
    window.addEventListener("pointercancel", pointerUp, true);
    rail.addEventListener("lostpointercapture", lostCapture);
    rail.addEventListener("pointerleave", pointerLeave);
    rail.addEventListener("click", click, true);
    rail.addEventListener("focusin", focus);
    paint();
    return () => {
      stop();
      if (paintFrame !== null) cancelAnimationFrame(paintFrame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", resize);
      rail.removeEventListener("scroll", schedulePaint);
      rail.removeEventListener("wheel", wheel);
      rail.removeEventListener("pointerdown", pointerDown);
      rail.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp, true);
      window.removeEventListener("pointercancel", pointerUp, true);
      rail.removeEventListener("lostpointercapture", lostCapture);
      rail.removeEventListener("pointerleave", pointerLeave);
      rail.removeEventListener("click", click, true);
      rail.removeEventListener("focusin", focus);
      controllerRef.current = null;
    };
  }, [tracks, reducedMotion]);

  const onKeyDown = (event) => {
    if (event.repeat) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      controllerRef.current?.move(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      controllerRef.current?.align(event.key === "Home" ? 0 : tracks.length - 1);
    }
  };

  return (
    <div className="music-catalog-shelf music-disc-gallery">
      <ul className="music-catalog-grid music-disc-rail" ref={railRef} tabIndex={0} onKeyDown={onKeyDown}
        aria-label="MMONN songs. Drag, swipe, scroll horizontally, or use left and right arrow keys.">
        {tracks.map((track, index) => (
          <li className={`music-catalog-item${index === activeIndex ? " is-active" : ""}`} key={track.id}>
            <a className="music-catalog-card" href={track.spotifyUrl || artistUrl} draggable={false}
              target="_blank" rel="noopener noreferrer"
              aria-label={`Open ${track.name} by ${track.artists?.join(", ") || "MMONN"} on Spotify`}>
              <DiscArtwork image={track.album?.image} />
              <span className="music-catalog-card-copy">
                <span className="music-catalog-track-name">{track.name}</span>
                <span className="music-catalog-track-credit">{track.artists?.join(", ") || "MMONN"}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="visually-hidden" aria-live="polite">{tracks[activeIndex]?.name}, {activeIndex + 1} of {tracks.length}</p>
    </div>
  );
}
