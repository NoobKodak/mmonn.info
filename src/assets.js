/**
 * The hero artwork lives in `public/` rather than `src/`: the portrait alone is
 * a 1.7MB SVG with an embedded raster, which there is nothing to gain from
 * running through the bundler. `BASE_URL` keeps the paths correct under the
 * relative `base` set in vite.config.js.
 */
// Segments are encoded so filenames containing spaces still resolve.
export const publicAsset = (file) =>
  `${import.meta.env.BASE_URL}${file
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

export const asset = (file) => publicAsset(`assets/${file}`);
