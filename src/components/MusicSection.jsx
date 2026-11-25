import { useEffect, useRef, useState } from "react";

import MusicDiscGallery from "./MusicDiscGallery.jsx";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion.js";
import { fetchSpotifyDiscography } from "../lib/spotify.js";
import { useMusicVideos } from "../lib/content-store.jsx";
import "./MusicSection.css";

const FALLBACK_ARTIST_URL = "https://open.spotify.com/artist/57wPsYZkEErG0C2ntgqNTe";
const YOUTUBE_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

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
          {trackCount > 0 && <MusicDiscGallery tracks={catalog.tracks} artistUrl={artistUrl} />}

          {trackCount === 0 && (
            <p className="music-catalog-empty">No Spotify songs are available in this market.</p>
          )}
        </>
      )}

      <MusicVideoShowcase />


    </section>
  );
}
