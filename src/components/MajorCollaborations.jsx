import { useEffect, useRef, useState } from "react";

import { publicAsset } from "../assets.js";
import catalog from "../data/spotify.json";
import DiscArtwork from "./DiscArtwork.jsx";
import { useCollaborations } from "../lib/content-store.jsx";
import "./MajorCollaborations.css";

function releaseLinks(media = {}) {
  const spotify = media.spotifyEmbedUrl?.match(/^https:\/\/open\.spotify\.com\/embed\/(track|artist)\/([a-zA-Z0-9]+)/);
  const youtube = media.youtubeEmbedUrl?.match(/^https:\/\/www\.youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  return {
    spotify: spotify ? `https://open.spotify.com/${spotify[1]}/${spotify[2]}` : null,
    youtube: youtube ? `https://www.youtube.com/watch?v=${youtube[1]}` : null,
  };
}

export default function MajorCollaborations({ number, label }) {
  const collaborations = useCollaborations();
  const listRef = useRef(null);
  const [activeId, setActiveId] = useState(collaborations[0]?.id);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    let frame = null;
    const update = () => {
      frame = null;
      const rows = [...list.children];
      let active = rows[0];
      for (const row of rows) {
        const style = getComputedStyle(row);
        const stacking = style.position === "sticky";
        const pinnedTop = stacking ? parseFloat(style.top) : 0;
        // Advance when the incoming heading reaches the reading area. Reading
        // actual geometry also follows sticky offsets, resizing and reverse scroll.
        const readingLine = Math.max(innerHeight * (stacking ? 0.55 : 0.28), pinnedTop + 100);
        if (row.getBoundingClientRect().top <= readingLine) active = row;
      }
      if (active) setActiveId(active.dataset.id);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(list);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [collaborations]);

  return (
    <div className="mc">
      <p className="mc-label"><span className="mc-label-no">{number}.</span> {label}</p>
      <div className="mc-intro">
        <p>Different voices.<br />Shared records.</p>
        <span>{String(collaborations.length).padStart(2, "0")} collaborations — scroll through the releases</span>
      </div>
      <ol className="mc-list" ref={listRef}>
        {collaborations.map((collaboration, index) => {
          const active = collaboration.id === activeId;
          const links = releaseLinks(collaboration.media);
          const trackId = links.spotify?.match(/\/track\/([a-zA-Z0-9]+)/)?.[1];
          const release = catalog.tracks.find((track) => track.id === trackId)
            || catalog.tracks.find((track) => track.name.toLowerCase() === collaboration.track.toLowerCase());
          const image = release?.album?.image;
          const cover = image ? (/^https?:\/\//.test(image) ? image : publicAsset(image)) : null;
          return (
            <li className={`mc-row${active ? " mc-row--active" : ""}`} key={collaboration.id}
              data-id={collaboration.id} style={{ "--i": index }}>
              <article className="mc-release" tabIndex={0}
                aria-labelledby={`mc-title-${collaboration.id}`}
                onFocus={() => setActiveId(collaboration.id)}>
                <header className="mc-row-heading">
                  <span className="mc-row-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <h4 className="mc-row-title" id={`mc-title-${collaboration.id}`}>{collaboration.track}</h4>
                  <p className="mc-row-artists">{collaboration.artists.join(", ")}</p>
                </header>
                <div className="mc-row-details" aria-hidden={!active} inert={!active}>
                  <div className="mc-row-copy">
                    <p className="mc-row-description">{collaboration.description}</p>
                    <div className="mc-row-links">
                      {links.spotify && <a href={links.spotify} target="_blank" rel="noopener noreferrer">Listen on Spotify <span aria-hidden="true">↗</span></a>}
                      {links.youtube && <a href={links.youtube} target="_blank" rel="noopener noreferrer">Watch on YouTube <span aria-hidden="true">↗</span></a>}
                    </div>
                  </div>
                  {cover && (
                    <a className="mc-disc-link" href={release.spotifyUrl || links.spotify}
                      target="_blank" rel="noopener noreferrer"
                      aria-label={`Listen to ${collaboration.track} on Spotify`}>
                      <DiscArtwork image={cover} />
                    </a>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
