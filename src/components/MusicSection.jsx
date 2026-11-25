import { useEffect, useRef, useState } from "react";

import DiscArtwork from "./DiscArtwork.jsx";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import { fetchSpotifyDiscography } from "../lib/spotify.js";
import { useMusicVideos } from "../lib/content-store.jsx";
import MusicMetrics from "./MusicMetrics.jsx";
import "./MusicSection.css";

const FALLBACK_ARTIST_URL = "https://open.spotify.com/artist/57wPsYZkEErG0C2ntgqNTe";
const YOUTUBE_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

function TrackCard({ track, artistUrl }) {
  const artistCredits = track.artists?.join(", ") || "MMONN";
  return (
    <li className="music-catalog-item">
      <a className="music-catalog-card" href={track.spotifyUrl || artistUrl}
        target="_blank" rel="noopener noreferrer"
        aria-label={`Open ${track.name} by ${artistCredits} on Spotify`}>
        <DiscArtwork image={track.album?.image} />
        <span className="music-catalog-card-copy">
          <span className="music-catalog-track-name">{track.name}</span>
          <span className="music-catalog-track-credit">{artistCredits}</span>
        </span>
      </a>
    </li>
  );
}

function TrackShelf({ tracks, artistUrl }) {
  const railRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const rail = railRef.current;
    const update = () => setEdges({
      start: rail.scrollLeft <= 2,
      end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2,
    });
    const wheel = (event) => {
      // Horizontal gestures stay native. Vertical wheels move the shelf only
      // while it has space in that direction, then return to page scrolling.
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rail.clientWidth : 1);
      const room = delta > 0
        ? rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 2
        : rail.scrollLeft > 2;
      if (!room || !delta) return;
      event.preventDefault();
      rail.scrollLeft += delta;
    };
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    rail.addEventListener("scroll", update, { passive: true });
    rail.addEventListener("wheel", wheel, { passive: false });
    update();
    return () => {
      observer.disconnect();
      rail.removeEventListener("scroll", update);
      rail.removeEventListener("wheel", wheel);
    };
  }, [tracks]);

  const move = (direction) => {
    const rail = railRef.current;
    const card = rail.firstElementChild;
    const step = card.getBoundingClientRect().width + parseFloat(getComputedStyle(rail).columnGap);
    rail.scrollBy({ left: direction * step, behavior: reducedMotion ? "instant" : "smooth" });
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      railRef.current.scrollTo({ left: event.key === "Home" ? 0 : railRef.current.scrollWidth, behavior: reducedMotion ? "instant" : "smooth" });
    }
  };

  return (
    <div className="music-catalog-shelf">
      <div className="music-catalog-shelf-controls" aria-label="Browse tracks">
        <button type="button" onClick={() => move(-1)} disabled={edges.start} aria-label="Previous tracks">←</button>
        <button type="button" onClick={() => move(1)} disabled={edges.end} aria-label="Next tracks">→</button>
      </div>
      <ul className="music-catalog-grid" aria-label="MMONN songs on Spotify. Scroll horizontally or use left and right arrow keys."
        ref={railRef} tabIndex={0} onKeyDown={onKeyDown}>
        {tracks.map((track) => <TrackCard artistUrl={artistUrl} key={track.id} track={track} />)}
      </ul>
    </div>
  );
}

function LoadingGrid() {
  return (
    <ul className="music-catalog-grid music-catalog-grid--loading" aria-label="Loading Spotify songs">
      {Array.from({ length: 8 }, (_, index) => (
        <li className="music-catalog-loading-card" key={index} aria-hidden="true">
          <span className="music-catalog-loading-disc" />
          <span className="music-catalog-loading-line" />
          <span className="music-catalog-loading-line music-catalog-loading-line--short" />
        </li>
      ))}
    </ul>
  );
}

function MusicVideoShowcase() {
  const videos = useMusicVideos();

  return (
    <section className="music-video-showcase" aria-labelledby="music-videos-title">
      <div className="music-video-showcase-heading">
        <p>/ Watch</p>
        <h3 id="music-videos-title">Music videos</h3>
      </div>

      <div className="music-video-showcase-grid">
        {videos.map((video) => (
          <article className="music-video-showcase-item" key={video.id}>
            <p className="music-video-showcase-label">{video.title}</p>
            <div className="music-video-showcase-frame">
              <iframe
                src={video.embedUrl}
                title={`${video.title} music video`}
                loading="lazy"
                allow={YOUTUBE_ALLOW}
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function MusicSection({ id, number }) {
  const sectionRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [catalog, setCatalog] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetchSpotifyDiscography({ signal: controller.signal })
      .then((payload) => {
        setCatalog(payload);
        setStatus("ready");
      })
      .catch((requestError) => {
        if (requestError.name === "AbortError") return;
        setError(requestError.message);
        setStatus("error");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    let frame;
    const alignMusicRoute = () => {
      if (window.location.hash !== `#${id}`) return;
      frame = window.requestAnimationFrame(() => {
        sectionRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
      });
    };

    alignMusicRoute();
    window.addEventListener("hashchange", alignMusicRoute);
    return () => {
      window.removeEventListener("hashchange", alignMusicRoute);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [id, reducedMotion]);

  const artistUrl = catalog?.artist?.spotifyUrl || FALLBACK_ARTIST_URL;
  const trackCount = catalog?.tracks?.length || 0;
  const isReady = status === "ready";

  return (
    <section
      className="music-catalog"
      id={id}
      ref={sectionRef}
      aria-labelledby="music-title"
    >
      <header className="music-catalog-header">
        <div>
          <p className="music-catalog-index">/ {number}</p>
          <h2 className="music-catalog-title" id="music-title">
            MUSIC
          </h2>
        </div>

        <div className="music-catalog-header-side">
          <MusicMetrics />

        </div>
      </header>

      {status === "loading" && (
        <div className="music-catalog-status" role="status">
          <p>Loading the complete Spotify discography.</p>
          <LoadingGrid />
        </div>
      )}

      {status === "error" && (
        <div className="music-catalog-status music-catalog-status--error" role="status">
          <p>{error || "The live Spotify catalog is unavailable right now."}</p>
          <a href={artistUrl} target="_blank" rel="noreferrer">
            Open MMONN on Spotify
          </a>
        </div>
      )}

      {isReady && (
        <>
          {trackCount > 0 && <TrackShelf tracks={catalog.tracks} artistUrl={artistUrl} />}

          {trackCount === 0 && (
            <p className="music-catalog-empty">No Spotify songs are available in this market.</p>
          )}
        </>
      )}

      <MusicVideoShowcase />


    </section>
  );
}
