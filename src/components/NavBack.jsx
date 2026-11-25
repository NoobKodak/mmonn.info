/**
 * The icon-only "back" entry shared by SectionNav.jsx and AmaradNav.jsx: a
 * first list item styled like any other `nav-item`, but a <button> that
 * closes/reverses the reveal instead of linking anywhere.
 */
export default function NavBack({ onActivate }) {
  return (
    <li className="nav-item nav-back" style={{ "--i": 0 }}>
      <button
        type="button"
        className="nav-link nav-back-link"
        onClick={onActivate}
        aria-label="Back"
      >
        <span className="material-symbols-outlined nav-back-icon" aria-hidden="true">
          arrow_back
        </span>
      </button>
    </li>
  );
}
