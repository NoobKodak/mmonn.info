/**
 * Content validation for the admin panel.
 *
 * The Telegram editor runs this in the browser for helpful feedback and again
 * on the server before any draft or publish mutation. Server-side validation
 * is the authority; a browser never receives a Supabase service-role key.
 */

export class ValidationError extends Error {}

const fail = (message) => {
  throw new ValidationError(message);
};

function str(value, label, { max = 4000, allowEmpty = false } = {}) {
  if (typeof value !== "string") fail(`${label} must be text.`);
  if (!allowEmpty && !value.trim()) fail(`${label} cannot be empty.`);
  if (value.length > max) fail(`${label} is longer than ${max} characters.`);
  return value;
}

function list(value, label, { min = 0, max = 50 } = {}) {
  if (!Array.isArray(value)) fail(`${label} must be a list.`);
  if (value.length < min) fail(`${label} needs at least ${min} entries.`);
  if (value.length > max) fail(`${label} cannot hold more than ${max} entries.`);
  return value;
}

function exactKeys(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object.`);
  }
  const unexpected = Object.keys(value).filter((key) => !keys.includes(key));
  if (unexpected.length) fail(`${label} has unexpected field(s): ${unexpected.join(", ")}.`);
  return value;
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function slug(value, label) {
  const text = str(value, label, { max: 80 });
  if (!SLUG.test(text)) fail(`${label} must be lowercase letters, numbers and hyphens.`);
  return text;
}

/**
 * Asset paths point at an object in the `site-assets` Storage bucket, so they
 * are constrained to a relative path rather than any URL, and — when a list of
 * known assets is supplied — must actually be one of them.
 */
function assetPath(value, label, { allowEmpty = true, knownAssets } = {}) {
  const text = str(value, label, { max: 300, allowEmpty: true });
  if (!text.trim()) {
    if (allowEmpty) return "";
    fail(`${label} cannot be empty.`);
  }
  if (/^[a-z]+:/i.test(text) || text.startsWith("//")) {
    fail(`${label} must be a path in the site-assets bucket, not a URL.`);
  }
  if (text.startsWith("/") || text.startsWith("\\")) fail(`${label} must be a relative path.`);
  if (text.split(/[\\/]/).includes("..")) fail(`${label} cannot navigate outside the bucket.`);
  // Only a path under `uploads/` lives in the Supabase bucket and can be
  // checked against it. Everything else is one of the images bundled into the
  // project itself (the shared polaroid frame, a milestone backdrop, ...) —
  // those ship in `public/`, not in Storage, so there is nothing in
  // `knownAssets` to check them against.
  if (knownAssets && text.startsWith("uploads/") && !knownAssets.has(text)) {
    fail(`"${text}" (${label}) is not a file in site-assets. Pick or upload one from the panel.`);
  }
  return text;
}

/** An outbound link. Restricted to http(s) so nothing can smuggle in a `javascript:` URL. */
function externalUrl(value, label) {
  const text = str(value, label, { max: 500 });
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail(`${label} must be a full URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(`${label} must start with http:// or https://.`);
  }
  return text;
}

function embedUrl(value, label, provider, { allowEmpty = true } = {}) {
  const text = str(value, label, { max: 500, allowEmpty });
  if (!text.trim()) return "";

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    fail(`${label} must be a full embed URL.`);
  }
  if (parsed.protocol !== "https:") fail(`${label} must use https://.`);

  const host = parsed.hostname.toLowerCase();
  if (provider === "spotify") {
    if (host !== "open.spotify.com" || !/^\/embed\/(artist|album|track|playlist)\//.test(parsed.pathname)) {
      fail(`${label} must be an official Spotify embed URL.`);
    }
  }
  if (provider === "youtube") {
    const validHost = ["youtube.com", "www.youtube.com", "www.youtube-nocookie.com"].includes(host);
    if (!validHost || !/^\/embed\/[A-Za-z0-9_-]{6,}/.test(parsed.pathname)) {
      fail(`${label} must be an official YouTube embed URL.`);
    }
  }
  return text;
}

const ACCENTS = ["tape", "star", "pin"];
const SLIDE_KINDS = ["figures", "mark", "blend", "artwork"];
const TONES = ["dark", "light"];

/** An image slot: a Storage path plus its description and pixel size. */
function validateImage(image, label, { allowEmpty = true, knownAssets } = {}) {
  exactKeys(image, label, ["src", "width", "height", "alt"]);
  const src = assetPath(image.src, `${label}.src`, { allowEmpty, knownAssets });
  str(image.alt, `${label}.alt`, { max: 300, allowEmpty: !src.trim() });

  for (const side of ["width", "height"]) {
    const value = image[side];
    if (!Number.isFinite(value) || value < 0 || value > 20000) {
      fail(`${label}.${side} must be a size in pixels, or 0 if unknown.`);
    }
  }
}

/**
 * A polaroid frame — the shared one, or an entry's own override. An override
 * may leave `src` empty, which means "inherit the shared frame".
 */
function validateFrame(frame, label, { allowEmpty = true, knownAssets } = {}) {
  exactKeys(frame, label, ["src", "width", "height", "window"]);
  assetPath(frame.src, `${label}.src`, { allowEmpty, knownAssets });

  for (const side of ["width", "height"]) {
    const value = frame[side];
    if (!Number.isFinite(value) || value < 0 || value > 20000) {
      fail(`${label}.${side} must be a size in pixels, or 0 if unknown.`);
    }
  }

  exactKeys(frame.window, `${label}.window`, ["top", "side", "bottom"]);
  for (const edge of ["top", "side", "bottom"]) {
    const value = frame.window[edge];
    if (!Number.isFinite(value) || value < 0 || value > 49) {
      fail(`${label}.window.${edge} must be a percentage between 0 and 49.`);
    }
  }
}

/**
 * Validates the full content document. `knownAssets` — the set of paths
 * currently in the site-assets bucket — is optional; pass it to also catch a
 * reference to a file that was never actually uploaded.
 */
export function validateContent(payload, { knownAssets } = {}) {
  exactKeys(payload, "content", [
    "version",
    "hero",
    "musicMetrics",
    "music",
    "sections",
    "about",
    "polaroid",
    "collaborations",
    "milestones",
    "performances",
    "media",
    "projects",
    "contact",
  ]);

  if (payload.version !== 1) fail("Unsupported content version.");

  exactKeys(payload.hero, "hero", ["roles"]);
  list(payload.hero.roles, "hero.roles", { min: 1, max: 8 }).forEach((role, i) =>
    str(role, `hero.roles[${i}]`, { max: 40 }),
  );

  const musicMetrics = exactKeys(payload.musicMetrics, "musicMetrics", ["label", "items"]);
  str(musicMetrics.label, "musicMetrics.label", { max: 80 });
  list(musicMetrics.items, "musicMetrics.items", { max: 8 }).forEach((item, i) => {
    exactKeys(item, `musicMetrics.items[${i}]`, ["id", "label", "value"]);
    slug(item.id, `musicMetrics.items[${i}].id`);
    str(item.label, `musicMetrics.items[${i}].label`, { max: 60 });
    str(item.value, `musicMetrics.items[${i}].value`, { max: 40 });
  });

  const music = exactKeys(payload.music, "music", ["videos"]);
  list(music.videos, "music.videos", { max: 12 }).forEach((video, i) => {
    exactKeys(video, `music.videos[${i}]`, ["id", "title", "embedUrl"]);
    slug(video.id, `music.videos[${i}].id`);
    str(video.title, `music.videos[${i}].title`, { max: 120 });
    embedUrl(video.embedUrl, `music.videos[${i}].embedUrl`, "youtube", { allowEmpty: false });
  });

  list(payload.sections, "sections", { min: 1, max: 8 }).forEach((section, i) => {
    exactKeys(section, `sections[${i}]`, ["id", "label"]);
    slug(section.id, `sections[${i}].id`);
    str(section.label, `sections[${i}].label`, { max: 40 });
  });
  const sectionIds = payload.sections.map((section) => section.id);
  if (new Set(sectionIds).size !== sectionIds.length) fail("Section anchors must be unique.");

  exactKeys(payload.about, "about", ["headingAlt", "portraitAlt", "paragraphs"]);
  str(payload.about.headingAlt, "about.headingAlt", { max: 200 });
  str(payload.about.portraitAlt, "about.portraitAlt", { max: 300 });
  list(payload.about.paragraphs, "about.paragraphs", { min: 1, max: 12 }).forEach((p, i) =>
    str(p, `about.paragraphs[${i}]`, { max: 2000 }),
  );

  validateFrame(payload.polaroid, "polaroid", { allowEmpty: false, knownAssets });

  list(payload.collaborations, "collaborations", { max: 24 }).forEach((item, i) => {
    exactKeys(item, `collaborations[${i}]`, ["id", "track", "artists", "description", "photo", "media", "frame"]);
    slug(item.id, `collaborations[${i}].id`);
    str(item.track, `collaborations[${i}].track`, { max: 120 });
    list(item.artists, `collaborations[${i}].artists`, { min: 1, max: 10 }).forEach((artist, j) =>
      str(artist, `collaborations[${i}].artists[${j}]`, { max: 80 }),
    );
    str(item.description, `collaborations[${i}].description`, { max: 2000 });
    assetPath(item.photo, `collaborations[${i}].photo`, { knownAssets });
    const collaborationMedia = exactKeys(item.media, `collaborations[${i}].media`, [
      "spotifyEmbedUrl",
      "youtubeEmbedUrl",
      "youtubeLabel",
    ]);
    embedUrl(collaborationMedia.spotifyEmbedUrl, `collaborations[${i}].media.spotifyEmbedUrl`, "spotify", {
      allowEmpty: true,
    });
    embedUrl(collaborationMedia.youtubeEmbedUrl, `collaborations[${i}].media.youtubeEmbedUrl`, "youtube", {
      allowEmpty: true,
    });
    str(collaborationMedia.youtubeLabel, `collaborations[${i}].media.youtubeLabel`, {
      max: 120,
      allowEmpty: !collaborationMedia.youtubeEmbedUrl.trim(),
    });
    validateFrame(item.frame, `collaborations[${i}].frame`, { knownAssets });
  });

  const milestones = exactKeys(payload.milestones, "milestones", ["label", "slides"]);
  str(milestones.label, "milestones.label", { max: 80 });

  list(milestones.slides, "milestones.slides", { min: 1, max: 12 }).forEach((slide, i) => {
    const at = `milestones.slides[${i}]`;
    exactKeys(slide, at, ["id", "kind", "tone", "title", "backdrop", "art", "copy", "figures"]);
    slug(slide.id, `${at}.id`);

    if (!SLIDE_KINDS.includes(slide.kind)) fail(`${at}.kind must be one of: ${SLIDE_KINDS.join(", ")}.`);
    if (!TONES.includes(slide.tone)) fail(`${at}.tone must be one of: ${TONES.join(", ")}.`);

    str(slide.title, `${at}.title`, { max: 120 });
    validateImage(slide.backdrop, `${at}.backdrop`, { knownAssets });
    validateImage(slide.art, `${at}.art`, { knownAssets });
    str(slide.copy, `${at}.copy`, { max: 400, allowEmpty: true });

    list(slide.figures, `${at}.figures`, { max: 6 }).forEach((figure, j) => {
      const figureAt = `${at}.figures[${j}]`;
      exactKeys(figure, figureAt, ["id", "value", "suffix", "track", "metric"]);
      slug(figure.id, `${figureAt}.id`);
      if (!Number.isFinite(figure.value) || figure.value < 0 || figure.value > 1e12) {
        fail(`${figureAt}.value must be a positive number.`);
      }
      str(figure.suffix, `${figureAt}.suffix`, { max: 8, allowEmpty: true });
      str(figure.track, `${figureAt}.track`, { max: 80 });
      str(figure.metric, `${figureAt}.metric`, { max: 120 });
    });

    if (!slide.art.src && !slide.copy.trim() && !slide.figures.length) {
      fail(`${at} needs artwork, a line of copy, or at least one figure.`);
    }
  });

  const performances = exactKeys(payload.performances, "performances", ["label", "slides"]);
  str(performances.label, "performances.label", { max: 80 });
  list(performances.slides, "performances.slides", { min: 1, max: 24 }).forEach((slide, i) => {
    exactKeys(slide, `performances.slides[${i}]`, ["id", "src", "alt"]);
    slug(slide.id, `performances.slides[${i}].id`);
    assetPath(slide.src, `performances.slides[${i}].src`, { allowEmpty: false, knownAssets });
    str(slide.alt, `performances.slides[${i}].alt`, { max: 300 });
  });

  list(payload.media, "media", { max: 24 }).forEach((item, i) => {
    exactKeys(item, `media[${i}]`, ["id", "outlet", "copy", "background"]);
    slug(item.id, `media[${i}].id`);
    str(item.outlet, `media[${i}].outlet`, { max: 120 });
    str(item.copy, `media[${i}].copy`, { max: 1200 });
    exactKeys(item.background, `media[${i}].background`, ["src", "alt"]);
    assetPath(item.background.src, `media[${i}].background.src`, { allowEmpty: false, knownAssets });
    str(item.background.alt, `media[${i}].background.alt`, { max: 300 });
  });

  exactKeys(payload.projects, "projects", ["headline", "items"]);
  exactKeys(payload.projects.headline, "projects.headline", ["before", "circled", "after"]);
  str(payload.projects.headline.before, "projects.headline.before", { max: 200 });
  str(payload.projects.headline.circled, "projects.headline.circled", { max: 120 });
  str(payload.projects.headline.after, "projects.headline.after", { max: 200 });
  list(payload.projects.items, "projects.items", { max: 24 }).forEach((item, i) => {
    exactKeys(item, `projects.items[${i}]`, ["id", "caption", "plate", "accent"]);
    slug(item.id, `projects.items[${i}].id`);
    str(item.caption, `projects.items[${i}].caption`, { max: 400 });
    str(item.plate, `projects.items[${i}].plate`, { max: 60 });
    if (!ACCENTS.includes(item.accent)) fail(`projects.items[${i}].accent must be one of: ${ACCENTS.join(", ")}.`);
  });

  exactKeys(payload.contact, "contact", ["instagram", "email", "location"]);
  str(payload.contact.instagram, "contact.instagram", { max: 60 });
  if (/[\s/@]/.test(payload.contact.instagram.trim())) {
    fail("contact.instagram should be the handle only, with no @, spaces or URL.");
  }
  const email = str(payload.contact.email, "contact.email", { max: 200 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fail("contact.email is not a valid address.");
  str(payload.contact.location, "contact.location", { max: 120 });

  return payload;
}
