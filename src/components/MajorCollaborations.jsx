import { useEffect, useRef, useState } from "react";

import { contentAsset } from "../lib/content-asset.js";
import { frameFor, useCollaborations, usePolaroid } from "../lib/content-store.jsx";
import HyperText from "./HyperText.jsx";
import "./MajorCollaborations.css";

const SPOTIFY_ARTIST_EMBED = "https://open.spotify.com/embed/artist/57wPsYZkEErG0C2ntgqNTe?utm_source=generator";
const YOUTUBE_ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

/*
 * Keep the embeds paired with the release they belong to. The supplied video
 * links are only used for AMARAD and PLY4; the remaining dossiers never point
 * visitors to an unrelated video. A missing track id falls back to MMONN's
 * artist player until an official release-specific Spotify URL is available.
 */
const COLLABORATION_MEDIA = {
  lason: { spotifyTrackId: "1IZkg1yKs8wQOwXZveRkRN" },
  "ply4-remix": {
    spotifyTrackId: "3nRlbohAuTQDgKdB7RQWBk",
    youtube: {
      label: "PLY4 music video",
      src: "https://www.youtube.com/embed/i2igE_cixyw?start=61",
    },
  },
  "chillerong-busy": { spotifyTrackId: "5zwoGZDiCSCa0d0GcHMEC0" },
  "pagod-na": { spotifyTrackId: "4lRspLX3zBJcjdR4lMlFwc" },
  "kung-kakapit-ka": { spotifyTrackId: "5P0OmLtPsQlNpQBHYt8S6o" },
  amarad: {
    youtube: {
      label: "AMARAD music video",
      src: "https://www.youtube.com/embed/BEWqXUi_P4w?start=61",
    },
  },
};

function spotifyEmbed(trackId) {
  return trackId
    ? `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`
    : SPOTIFY_ARTIST_EMBED;
}

function CollaborationMedia({ collaboration }) {
  const media = COLLABORATION_MEDIA[collaboration.id] || {};
  const hasTrackEmbed = Boolean(media.spotifyTrackId);

  return (
    <section className="mc-dialog-media" aria-label={`Listen to ${collaboration.track}`}>
      <div className="mc-dialog-media-item">
        <p className="mc-dialog-media-label">Spotify</p>
        <iframe
          className="mc-dialog-embed mc-dialog-embed--spotify"
          src={spotifyEmbed(media.spotifyTrackId)}
          title={
            hasTrackEmbed
              ? `Listen to ${collaboration.track} on Spotify`
              : "Listen to MMONN on Spotify"
          }
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      </div>

      {media.youtube ? (
        <div className="mc-dialog-media-item">
          <p className="mc-dialog-media-label">YouTube</p>
          <iframe
            className="mc-dialog-embed mc-dialog-embed--youtube"
            src={media.youtube.src}
            title={media.youtube.label}
            loading="lazy"
            allow={YOUTUBE_ALLOW}
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="mc-dialog-media-item mc-dialog-media-item--unavailable">
          <p className="mc-dialog-media-label">YouTube</p>
          <p>No official video embed is linked for this release yet.</p>
        </div>
      )}
    </section>
  );
}

function Polaroid({ collaboration, polaroid, className = "" }) {
  // Each entry may carry its own frame; otherwise it takes the shared one.
  const frame = frameFor(collaboration, polaroid);

  return (
    <span
      className={`mc-frame ${className}`.trim()}
      style={{
        "--window-top": `${frame.window.top}%`,
        "--window-side": `${frame.window.side}%`,
        "--window-bottom": `${frame.window.bottom}%`,
      }}
    >
      <img
        className="mc-paper"
        src={contentAsset(frame.src)}
        alt=""
        width={frame.width || undefined}
        height={frame.height || undefined}
      />
      {collaboration.photo && (
        <img
          className="mc-photo"
          src={contentAsset(collaboration.photo)}
          alt=""
          loading="lazy"
        />
      )}
    </span>
  );
}

export default function MajorCollaborations({ number, label }) {
  const COLLABORATIONS = useCollaborations();
  const polaroid = usePolaroid();
  const [openId, setOpenId] = useState(null);
  const [displayedId, setDisplayedId] = useState(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastTriggerRef = useRef(null);
  const contentRemovalTimerRef = useRef(null);
  const open = COLLABORATIONS.find((item) => item.id === displayedId);

  /**
   * A native <dialog> opened with showModal(), rather than a hand-rolled
   * overlay: the platform then supplies the focus trap, Escape to dismiss,
   * inert background, top-layer stacking, and focus returning to whichever
   * polaroid was clicked — none of which need to be written or maintained.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (openId && !dialog.open) {
      // State has rendered the selected release before this effect runs, so
      // the modal never opens with an empty panel.
      dialog.showModal();

      const focusFrame = requestAnimationFrame(() => {
        closeButtonRef.current?.focus({ preventScroll: true });
      });

      return () => cancelAnimationFrame(focusFrame);
    }

    if (!openId && dialog.open) dialog.close();
    return undefined;
  }, [openId]);

  /**
   * Listened for natively rather than with React's `onClose`. The `close`
   * event does not bubble, so it never reaches React's delegated root
   * listener — leaving `openId` stale after Escape, which made clicking the
   * same polaroid again a no-op state update that could never reopen it.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const syncClosed = () => {
      setOpenId(null);

      // Leave the selected dossier mounted for the short native-dialog exit
      // transition, avoiding an empty white sheet during the fade-out.
      if (contentRemovalTimerRef.current) {
        window.clearTimeout(contentRemovalTimerRef.current);
      }
      contentRemovalTimerRef.current = window.setTimeout(() => {
        setDisplayedId(null);
        contentRemovalTimerRef.current = null;
      }, 300);

      // Native dialogs restore focus in modern browsers. Doing this explicitly
      // also keeps the clicked polaroid as the predictable return point.
      requestAnimationFrame(() => {
        lastTriggerRef.current?.focus({ preventScroll: true });
      });
    };
    dialog.addEventListener("close", syncClosed);
    return () => dialog.removeEventListener("close", syncClosed);
  }, []);

  useEffect(
    () => () => {
      if (contentRemovalTimerRef.current) {
        window.clearTimeout(contentRemovalTimerRef.current);
      }
    },
    [],
  );

  const handleOpen = (event, id) => {
    if (contentRemovalTimerRef.current) {
      window.clearTimeout(contentRemovalTimerRef.current);
      contentRemovalTimerRef.current = null;
    }

    lastTriggerRef.current = event.currentTarget;
    setDisplayedId(id);
    setOpenId(id);
  };

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
      return;
    }

    setOpenId(null);
  };

  // Browsers retarget a native-dialog backdrop click to the dialog. Check the
  // pointer coordinates instead of relying on event.target alone so clicks in
  // the sheet's own padding never dismiss the selected collaboration.
  const handleDialogClick = (event) => {
    const dialog = dialogRef.current;
    if (!dialog || event.target !== dialog) return;

    const { top, right, bottom, left } = dialog.getBoundingClientRect();
    const clickedBackdrop =
      event.clientX < left ||
      event.clientX > right ||
      event.clientY < top ||
      event.clientY > bottom;

    if (clickedBackdrop) handleClose();
  };

  return (
    <div className="mc">
      <p className="mc-label">
        <span className="mc-label-no">{number}.</span> {label}
      </p>

      <ul className="mc-grid">
        {COLLABORATIONS.map((collaboration, index) => (
          <li className="mc-item" key={collaboration.id} style={{ "--i": index }}>
            <button
              className="mc-card"
              type="button"
              data-id={collaboration.id}
              aria-haspopup="dialog"
              onClick={(event) => handleOpen(event, collaboration.id)}
            >
              <Polaroid collaboration={collaboration} polaroid={polaroid} />
              <span className="visually-hidden">
                {collaboration.track} with {collaboration.artists.join(", ")}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        className="mc-dialog"
        ref={dialogRef}
        aria-labelledby="mc-dialog-track"
        aria-describedby="mc-dialog-description"
        onClick={handleDialogClick}
      >
        {open && (
          <div className="mc-dialog-shell" key={open.id}>
            <header className="mc-dialog-topbar">
              <p className="mc-dialog-kicker">
                Collaboration file <span aria-hidden="true">/</span> {number}
              </p>
              <button
                className="mc-close"
                ref={closeButtonRef}
                type="button"
                onClick={handleClose}
                aria-label="Close collaboration details"
              >
                <span>Close</span>
                <span className="mc-close-mark" aria-hidden="true">
                  ×
                </span>
              </button>
            </header>

            <div className="mc-dialog-panel">
              <div className="mc-dialog-frame-wrap">
                <Polaroid collaboration={open} polaroid={polaroid} className="mc-frame--detail" />
              </div>

              <div className="mc-credits">
                <p className="mc-dialog-index">
                  {String(COLLABORATIONS.indexOf(open) + 1).padStart(2, "0")} / {String(COLLABORATIONS.length).padStart(2, "0")}
                </p>
                <HyperText className="mc-artists" as="p" duration={720}>
                  {open.artists.join(", ")}
                </HyperText>
                <HyperText
                  className="mc-track"
                  as="h4"
                  id="mc-dialog-track"
                  duration={620}
                  delay={100}
                >
                  {open.track}
                </HyperText>
                <div className="mc-dialog-note">
                  <p className="mc-dialog-note-label">Sample release note</p>
                  <p className="mc-dialog-description" id="mc-dialog-description">
                    {open.description}
                  </p>
                </div>
                <CollaborationMedia collaboration={open} />
                <button className="mc-return" type="button" onClick={handleClose}>
                  <span aria-hidden="true">←</span> Back to all collaborations
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
