import { useProjects } from "../lib/content-store.jsx";
import "./NotableProjects.css";

/** A hand-drawn looking ring, overshooting the way a marker would. */
function Ring() {
  return (
    <svg
      className="np-ring"
      viewBox="0 0 300 90"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M150 6C74 3 12 22 7 46c-5 25 62 42 145 41 79-1 143-19 141-43C291 21 232 6 152 5c-24 0-49 2-70 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function NotableProjects({ number, label }) {
  const { headline: PROJECTS_HEADLINE, items: PROJECTS } = useProjects();

  return (
    <div className="np">
      <p className="np-label">
        <span className="np-label-no">{number}.</span> {label}
      </p>

      <h4 className="np-headline">
        {PROJECTS_HEADLINE.before}{" "}
        <span className="np-circled">
          {PROJECTS_HEADLINE.circled}
          <Ring />
        </span>{" "}
        {PROJECTS_HEADLINE.after}
      </h4>

      <ol className="np-list">
        {PROJECTS.map((project, index) => (
          <li className="np-item" key={project.id} style={{ "--i": index }}>
            <span className="np-no">{String(index + 1).padStart(2, "0")}.</span>

            <span className="np-plate" data-accent={project.accent}>
              <span className="np-plate-text">{project.plate}</span>
            </span>

            <span className="np-caption">{project.caption}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
