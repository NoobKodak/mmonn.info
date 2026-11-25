import "./SocialFooter.css";

const PROFILES = [
  ["Instagram", "https://www.instagram.com/mmonn.msc/", "instagram"],
  ["Spotify", "https://open.spotify.com/artist/57wPsYZkEErG0C2ntgqNTe", "spotify"],
  ["Apple Music", "https://music.apple.com/ph/artist/mmonn/1632799825", "apple-music"],
  ["Facebook", "https://www.facebook.com/MMONN.MUSIC/", "facebook"],
  ["YouTube", "https://www.youtube.com/channel/UCA1RgFY7_xSP2YUvN1IpjCw", "youtube"],
];

// Small inline marks drawn here; no external icon package or remote requests.
function SocialIcon({ kind }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false">
      {kind === "instagram" && <g stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </g>}
      {kind === "spotify" && <>
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <g stroke="#000" strokeWidth="1.6" strokeLinecap="round">
          <path d="M6 9c4-1.3 8.5-.8 12 1" /><path d="M6.8 12.2c3.4-1 7-.6 10 1" /><path d="M7.6 15.2c2.6-.7 5.5-.4 8 .7" />
        </g>
      </>}
      {kind === "apple-music" && <>
        <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 16V7l7-1.5v9" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M10 9.5l7-1.5" stroke="currentColor" strokeWidth="1.7" />
        <ellipse cx="8.2" cy="16.8" rx="2.3" ry="1.7" fill="currentColor" />
        <ellipse cx="15.2" cy="15.3" rx="2.3" ry="1.7" fill="currentColor" />
      </>}
      {kind === "facebook" && <path fill="currentColor" d="M14 22v-9h3l.5-3H14V8c0-1 .4-1.5 1.7-1.5H18V3.2c-.7-.1-1.8-.2-2.8-.2C12.4 3 11 4.7 11 7.6V10H8v3h3v9z" />}
      {kind === "youtube" && <>
        <rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor" />
        <path d="m10 9 6 3-6 3z" fill="#000" />
      </>}
    </svg>
  );
}

export default function SocialFooter() {
  return (
    <footer className="social-footer">
      <nav aria-label="Social and music profiles">
        {PROFILES.map(([name, href, kind]) => (
          <a href={href} key={kind} aria-label={name} title={name}
            target="_blank" rel="noopener noreferrer"><SocialIcon kind={kind} /></a>
        ))}
      </nav>
    </footer>
  );
}
