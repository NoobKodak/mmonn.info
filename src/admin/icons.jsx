/**
 * Small inline icon set — no icon library dependency, just the handful of
 * glyphs the panel actually uses. Each is a plain 20x20 stroke icon that
 * inherits `currentColor`, so it follows whatever text color its button sets.
 */
const base = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  focusable: "false",
};

export const IconDashboard = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="3" width="6.5" height="6.5" rx="1.3" />
    <rect x="10.5" y="3" width="6.5" height="4.5" rx="1.3" />
    <rect x="10.5" y="9" width="6.5" height="8" rx="1.3" />
    <rect x="3" y="11.5" width="6.5" height="5.5" rx="1.3" />
  </svg>
);

export const IconHero = (props) => (
  <svg {...base} {...props}>
    <circle cx="10" cy="7" r="3" />
    <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
  </svg>
);

export const IconCompass = (props) => (
  <svg {...base} {...props}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="m12.6 7.4-1.4 3.8-3.8 1.4 1.4-3.8z" />
  </svg>
);

export const IconInfo = (props) => (
  <svg {...base} {...props}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 9.2v4.3M10 6.8v.1" />
  </svg>
);

export const IconUsers = (props) => (
  <svg {...base} {...props}>
    <circle cx="7.2" cy="7" r="2.6" />
    <path d="M2.5 16c0-2.6 2.1-4.3 4.7-4.3s4.7 1.7 4.7 4.3" />
    <circle cx="14.4" cy="7.6" r="2" />
    <path d="M13.2 11.9c1.9.3 3.3 1.7 3.3 3.7" />
  </svg>
);

export const IconChart = (props) => (
  <svg {...base} {...props}>
    <path d="M3 17V3M3 17h14" />
    <path d="M6 14v-4M10 14V6M14 14v-7" />
  </svg>
);

export const IconMegaphone = (props) => (
  <svg {...base} {...props}>
    <path d="M3 8.5v3l9.5 3.7V4.8z" />
    <path d="M12.5 6.2 17 4v12l-4.5-2.2" />
    <path d="M5.5 11.5 6.8 16" />
  </svg>
);

export const IconStar = (props) => (
  <svg {...base} {...props}>
    <path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" />
  </svg>
);

export const IconMail = (props) => (
  <svg {...base} {...props}>
    <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" />
    <path d="m3 5.5 7 5.5 7-5.5" />
  </svg>
);

export const IconImage = (props) => (
  <svg {...base} {...props}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="1.6" />
    <circle cx="7" cy="8" r="1.4" />
    <path d="m4 15 4.2-4.2a1.6 1.6 0 0 1 2.2 0L16 16" />
  </svg>
);

export const IconChevronRight = (props) => (
  <svg {...base} {...props}>
    <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
  </svg>
);

export const IconChevronUp = (props) => (
  <svg {...base} {...props}>
    <path d="m4.5 12.5 5.5-5.5 5.5 5.5" />
  </svg>
);

export const IconChevronDown = (props) => (
  <svg {...base} {...props}>
    <path d="m4.5 7.5 5.5 5.5 5.5-5.5" />
  </svg>
);

export const IconPlus = (props) => (
  <svg {...base} {...props}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const IconTrash = (props) => (
  <svg {...base} {...props}>
    <path d="M4 6h12M8 6V4.3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V6M6 6l.7 9.3A1.5 1.5 0 0 0 8.2 16.7h3.6a1.5 1.5 0 0 0 1.5-1.4L14 6" />
    <path d="M8.3 9v4.3M11.7 9v4.3" />
  </svg>
);

export const IconFolder = (props) => (
  <svg {...base} {...props}>
    <path d="M2.5 5.5a1 1 0 0 1 1-1H8l1.5 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
  </svg>
);

export const IconUpload = (props) => (
  <svg {...base} {...props}>
    <path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" />
    <path d="M4 14.5v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" />
  </svg>
);

export const IconExternal = (props) => (
  <svg {...base} {...props}>
    <path d="M8.3 4.5H15v6.7" />
    <path d="M15 4.5 8.5 11" />
    <path d="M12.5 11v3.7a1.3 1.3 0 0 1-1.3 1.3H5a1.3 1.3 0 0 1-1.3-1.3v-6.2A1.3 1.3 0 0 1 5 7.2h3.7" />
  </svg>
);

export const IconRefresh = (props) => (
  <svg {...base} {...props}>
    <path d="M16 10a6 6 0 1 1-1.8-4.3" />
    <path d="M16 3v3.5h-3.5" />
  </svg>
);

export const IconHammer = (props) => (
  <svg {...base} {...props}>
    <path d="m8.5 8.5-5 5a1.4 1.4 0 0 0 0 2l1 1a1.4 1.4 0 0 0 2 0l5-5" />
    <path d="M11 6 14.5 2.5l3 3L14 9M11 6l1.3 1.3M11 6 9.7 7.3" />
  </svg>
);

export const IconLogOut = (props) => (
  <svg {...base} {...props}>
    <path d="M8 4H4.6A1.6 1.6 0 0 0 3 5.6v8.8A1.6 1.6 0 0 0 4.6 16H8" />
    <path d="M12.5 6.5 17 10l-4.5 3.5M17 10H7.5" />
  </svg>
);

export const IconMore = (props) => (
  <svg {...base} {...props}>
    <circle cx="4.5" cy="10" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="10" r="1.15" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCheck = (props) => (
  <svg {...base} {...props}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </svg>
);

export const IconAlert = (props) => (
  <svg {...base} {...props}>
    <path d="M10 3 2.5 16.5h15z" />
    <path d="M10 8.3v3.4M10 14.2v.1" />
  </svg>
);

export const IconX = (props) => (
  <svg {...base} {...props}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </svg>
);

export const IconEye = (props) => (
  <svg {...base} {...props}>
    <path d="M2 10s2.8-5.5 8-5.5 8 5.5 8 5.5-2.8 5.5-8 5.5-8-5.5-8-5.5z" />
    <circle cx="10" cy="10" r="2.3" />
  </svg>
);

export const IconEyeOff = (props) => (
  <svg {...base} {...props}>
    <path d="M3 3l14 14" />
    <path d="M9 5.6c.3 0 .7-.1 1-.1 5.2 0 8 5.5 8 5.5a13.5 13.5 0 0 1-2.4 3.1M6.2 6.6A13.6 13.6 0 0 0 2 10s2.8 5.5 8 5.5c1 0 1.9-.2 2.7-.5" />
    <path d="M8.1 11.9a2.3 2.3 0 0 1 3.2-3.2" />
  </svg>
);

export const IconLock = (props) => (
  <svg {...base} {...props}>
    <rect x="4" y="9" width="12" height="8" rx="1.6" />
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
  </svg>
);

export const IconHistory = (props) => (
  <svg {...base} {...props}>
    <path d="M3 10a7 7 0 1 1 2 4.9" />
    <path d="M3 15v-3.5h3.5" />
    <path d="M10 6.5V10l2.5 1.5" />
  </svg>
);
