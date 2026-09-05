import { publicAsset } from "../assets.js";
import { supabase } from "./supabase.js";

/**
 * Resolves an image path stored in the site's content (a polaroid frame, a
 * milestone backdrop, a media background, ...) to a URL that actually loads
 * it — which depends on where the file lives:
 *
 *  - The content the project shipped with points at files bundled into
 *    `public/`, served locally by Vite (or whatever host serves `dist/`).
 *  - Anything chosen through the admin panel's Upload button lands in the
 *    Supabase Storage bucket `site-assets`, under an `uploads/` prefix, and
 *    has to be fetched from there instead.
 *
 * `uploads/` is the dividing line: nothing bundled into the project ever uses
 * that prefix, and every upload always does, so the prefix alone is enough to
 * tell the two apart without maintaining a separate lookup.
 */
export function contentAsset(path) {
  if (!path) return "";

  if (path.startsWith("uploads/") && supabase) {
    return supabase.storage.from("site-assets").getPublicUrl(path).data.publicUrl;
  }

  return publicAsset(path);
}
