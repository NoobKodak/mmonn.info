import MediaCoverage from "./MediaCoverage.jsx";

/**
 * Top-level wrapper for the media-coverage rail. `MediaCoverage` paints its
 * own full-bleed slides and is reused as-is; this only supplies the section
 * landmark, the anchor the hero navigation targets, and a heading for it.
 */
export default function MediaCoverageSection({ id, number, label }) {
  const headingId = `${id}-title`;

  return (
    <section className="mv-section" id={id} aria-labelledby={headingId}>
      <h2 className="visually-hidden" id={headingId}>
        Media coverage
      </h2>
      <MediaCoverage number={number} label={label} />
    </section>
  );
}
