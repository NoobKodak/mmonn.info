import { asset } from "../assets.js";
import { useRoles } from "../lib/content-store.jsx";

/**
 * A list rather than one run of text, so the roles are announced as three
 * items; the star separators are decorative and stay out of the a11y tree.
 */
export default function RoleList() {
  const ROLES = useRoles();

  return (
    <ul className="role-list">
      {ROLES.map((role, index) => (
        <li className="role" key={role}>
          {index > 0 && (
            <img
              className="role-star"
              src={asset("star-icon.svg")}
              alt=""
              width="18"
              height="18"
            />
          )}
          {role}
        </li>
      ))}
    </ul>
  );
}
