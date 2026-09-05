import { asset } from "../assets.js";

export default function ExploreButton({ controls, expanded, onActivate }) {
  return (
    <button
      className="explore"
      type="button"
      aria-controls={controls}
      aria-expanded={expanded}
      onClick={onActivate}
    >
      <span className="explore-content">
        <img
          className="explore-icon"
          src={asset("explore-icon.svg")}
          alt=""
          width="24"
          height="24"
        />
        <span className="explore-label">EXPLORE MORE</span>
      </span>
    </button>
  );
}
