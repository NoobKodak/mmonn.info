/**
 * MMONN discography.
 *
 * Verified 1 Sept 2026 against the artist's own Spotify, Apple Music and
 * YouTube pages. Stream counts are a snapshot from Spotify on that date, so
 * treat them as approximate and refresh them when convenient.
 *
 * Deliberately NOT deep-linked per release: Spotify lists two different
 * "Lason" entries (an MMONN single and a 2025 collaboration with Alisson
 * Shore & Because) and the two stores disagree on several years, so every
 * release points at the platform profiles rather than a guessed track URL.
 * Add a `spotify` / `youtube` field to any release once you confirm its URL.
 */

export const PLATFORMS = [
  {
    id: "spotify",
    name: "Spotify",
    url: "https://open.spotify.com/artist/57wPsYZkEErG0C2ntgqNTe",
  },
  {
    id: "apple",
    name: "Apple Music",
    url: "https://music.apple.com/ph/artist/mmonn/1632799825",
  },
  {
    id: "youtube",
    name: "YouTube",
    url: "https://www.youtube.com/@MMONN",
  },
];

export const MONTHLY_LISTENERS = 19579;

/** The newest release, given its own block at the top of the section. */
export const LATEST = {
  title: "Panganib",
  type: "Single",
  year: "2026",
  released: "3 April 2026",
  streams: 17737,
  cover: "covers/panganib.jpg",
  // Both confirmed directly against Spotify oEmbed and YouTube oEmbed.
  spotify: "https://open.spotify.com/track/6hFTpybHEefCqqOoP0RvOr",
  youtube: "https://www.youtube.com/watch?v=DYt-8vUdYDE",
};

/** The signature track — the one to lead with. */
export const NOTABLE = {
  title: "Lason",
  type: "Single",
  year: "2025",
  streams: 528640,
  cover: "covers/lason.jpg",
};

/** Selected tracks, strongest first. */
export const SELECTED = [
  { title: "Lason", year: "2025", streams: 528640, cover: "covers/lason.jpg" },
  { title: "PLY4", year: "2025", streams: 367068, cover: "covers/ply4.jpg" },
  {
    title: "Naga City Baby",
    year: "2025",
    streams: 15960,
    cover: "covers/naga-city-baby.jpg",
  },
  { title: "Hvndg", year: "2025", cover: "covers/hvndg.jpg" },
  {
    title: "Kung Kakapit Ka",
    year: "2024",
    note: "feat. Ne7in",
    cover: "covers/kung-kakapit-ka.jpg",
  },
];

/**
 * Spotify also lists a separate 2023 "Ply4" (302,326 streams, prod. CRMDRM,
 * youtube.com/watch?v=45HSCKGN6Do). It is left out of SELECTED because two
 * rows both reading PLY4 wastes a slot in a curated five — add it back if you
 * would rather show both cuts.
 */

/**
 * Editorial photography for the section. Save the files into
 * `public/assets/` under these names; each slot falls back to a typographic
 * panel while the image is missing, so nothing renders broken.
 */
export const PHOTOS = {
  group: { src: "music-group.jpg", alt: "MMONN with two collaborators, photographed in black and white." },
  street: { src: "music-street.jpg", alt: "MMONN standing against shuttered market stalls at night in Naga City." },
};
