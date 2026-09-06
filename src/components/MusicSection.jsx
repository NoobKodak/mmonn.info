import { useEffect, useState } from "react";

import { useInView } from "../hooks/useInView.js";
import { fetchSpotifyDiscography } from "../lib/spotify.js";
import { useMusicVideos } from "../lib/content-store.jsx";
import MusicMetrics from "./MusicMetrics.jsx";
import "./MusicSection.css";

const FALLBACK_ARTIST_URL = "https://open.spotify.com/artist/57wPsYZkEErG0C2ntgqNTe";
const YOUTUBE_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

const pad = (number) => String(number).padStart(2, "0");

function releaseYear(date) {
  return date ? String(date).slice(0, 4) : "—";
}

function DiscArtwork({ track }) {
  const [imageFailed, setImageFailed] = useState(!track.album.image);

  return (
    <span className="music-catalog-disc-stage" aria-hidden="true">
      <span className="music-catalog-disc" />
      {imageFailed ? (
        <span className="music-catalog-artwork-fallback">MMONN</span>
      ) : (
        <img
          className="music-catalog-artwork"
          src={track.album.image}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
      <span className="music-catalog-disc-hole" />
    </span>
  );
}

function TrackCard({ track, index, artistUrl }) {
  const artistCredits = track.artists?.join(", ");
  const delay = `${Math.min(index, 12) * 45}ms`;

  return (
    <li className="music-catalog-item" style={{ "--card-delay": delay }}>
      <a
        className="music-catalog-card"
        href={track.spotifyUrl || artistUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${track.name} by ${artistCredits || "MMONN"} on Spotify`}
      >
        <DiscArtwork track={track} />
        <span className="music-catalog-card-copy">
          <span className="music-catalog-track-number" aria-hidden="true">
            {pad(index + 1)}
          </span>
          <span className="music-catalog-track-name">{track.name}</span>
          <span className="music-catalog-track-meta">
            {track.album.name && (
              <>
                {track.album.name} <span aria-hidden="true">/</span>{" "}
              </>
            )}
            {releaseYear(track.releaseDate)}
          </span>
          {artistCredits && artistCredits !== "MMONN" && (
            <span className="music-catalog-track-credit">{artistCredits}</span>
          )}
        </span>
      </a>
    </li>
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
  const [sectionRef, inView] = useInView({ threshold: 0.12 });
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
        sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    };

    alignMusicRoute();
    window.addEventListener("hashchange", alignMusicRoute);
    return () => {
      window.removeEventListener("hashchange", alignMusicRoute);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [id, sectionRef]);

  const artistUrl = catalog?.artist?.spotifyUrl || FALLBACK_ARTIST_URL;
  const trackCount = catalog?.tracks?.length || 0;
  const isReady = status === "ready";
  const isCachedCatalog = Boolean(catalog?.isCachedFallback);

  return (
    <section
      className="music-catalog"
      id={id}
      ref={sectionRef}
      aria-labelledby="music-title"
      data-entered={isReady && inView ? "true" : undefined}
    >
      <header className="music-catalog-header">
        <div>
          <p className="music-catalog-index">/ {number}</p>
          <h2 className="music-catalog-title" id="music-title">
            MUSIC
          </h2>
        </div>

        <div className="music-catalog-header-meta">
          <p className="music-catalog-kicker" aria-live="polite">
            {isReady
              ? `${trackCount} songs / ${isCachedCatalog ? "saved" : "live"} Spotify catalog`
              : "Spotify catalog"}
          </p>
          <a href={artistUrl} target="_blank" rel="noreferrer">
            MMONN on Spotify
          </a>
        </div>
      </header>

      <MusicMetrics />
      <MusicVideoShowcase />

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
          {isCachedCatalog && (
            <p className="music-catalog-cache-note" role="status">
              Showing the saved catalog while Spotify reconnects.
            </p>
          )}
          <ul className="music-catalog-grid" aria-label="MMONN songs on Spotify">
            {catalog.tracks.map((track, index) => (
              <TrackCard
                artistUrl={artistUrl}
                index={index}
                key={track.id}
                track={track}
              />
            ))}
          </ul>

          {trackCount === 0 && (
            <p className="music-catalog-empty">No Spotify songs are available in this market.</p>
          )}
        </>
      )}

      <footer className="music-catalog-footer">
        <span>Catalog data and artwork from Spotify.</span>
        <a href={artistUrl} target="_blank" rel="noreferrer">
          Listen on Spotify
        </a>
      </footer>
    </section>
  );
}
