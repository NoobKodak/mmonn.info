import NotableProjects from "./NotableProjects.jsx";

/**
 * Top-level wrapper for the notable-projects sheet. `NotableProjects` paints
 * its own full-height page and is reused as-is; this only supplies the section
 * landmark, the anchor the hero navigation targets, and a heading for it.
 */
export default function NotableProjectsSection({ id, number, label }) {
  const headingId = `${id}-title`;

  return (
    <section className="np-section" id={id} aria-labelledby={headingId}>
      <h2 className="visually-hidden" id={headingId}>
        Notable projects
      </h2>
      <NotableProjects number={number} label={label} />
    </section>
  );
}
