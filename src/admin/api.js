import { requireSupabase, supabase } from "../lib/supabase.js";
import { validateContent } from "./validate.js";

const CONTENT_ID = "live";
const BUCKET = "site-assets";

/* ---------------------------------------------------------------------------
   Auth

   The panel is a plain client-side app now — there is no server of its own
   guarding these calls. Postgres RLS is the actual gate: `site_content` and
   `site-assets` only accept writes from a signed-in ("authenticated") user,
   so signing in here is what turns write access on, not a check this code
   performs itself.
   ------------------------------------------------------------------------ */

export function getSession() {
  return requireSupabase()
    .auth.getSession()
    .then(({ data }) => data.session);
}

export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = requireSupabase().auth.onAuthStateChange((_event, session) => callback(session));
  return () => subscription.unsubscribe();
}

export async function signIn(email, password) {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

/** First run only: there is no editor account yet, so one is created here. */
export async function signUp(email, password) {
  const { error } = await requireSupabase().auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------------
   Content
   ------------------------------------------------------------------------ */

export async function loadContent() {
  const { data, error } = await requireSupabase()
    .from("site_content")
    .select("content, updated_at")
    .eq("id", CONTENT_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No "live" row exists in site_content yet.');

  return { content: data.content, revision: data.updated_at };
}

/**
 * `revision` is the `updated_at` this content was loaded with. The update is
 * conditioned on that same value still being current, so a second tab (or a
 * change made outside the panel) that landed in between causes this write to
 * match zero rows instead of silently overwriting it.
 */
export async function saveContent(content, revision, { knownAssets } = {}) {
  const validated = validateContent(content, { knownAssets });

  const { data, error } = await requireSupabase()
    .from("site_content")
    .update({ content: validated })
    .eq("id", CONTENT_ID)
    .eq("updated_at", revision)
    .select("content, updated_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(
      "The content changed since this editor loaded it — another tab, or an edit made " +
        "outside the panel, got there first. Reload from disk, then reapply your change.",
    );
  }

  return { content: data.content, revision: data.updated_at, savedAt: data.updated_at };
}

/* ---------------------------------------------------------------------------
   Assets — Supabase Storage bucket `site-assets`
   ------------------------------------------------------------------------ */

/** `list()` is one directory level at a time, so this walks the tree itself. */
export async function loadAssets() {
  const client = requireSupabase();
  const found = [];

  async function walk(prefix) {
    const { data, error } = await client.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(error.message);

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A Storage "folder" placeholder has no id and no metadata.
      if (entry.id === null) {
        await walk(path);
      } else {
        found.push({ path, size: entry.metadata?.size ?? 0 });
      }
    }
  }

  await walk("");
  return found;
}

/**
 * The project's own bundled images (the shared polaroid frame, milestone
 * backgrounds, ...), read straight from `public/` by the local dev server.
 * Read-only, and safe to expose: `public/` is already served to every visitor
 * of the site itself.
 */
export async function loadLocalAssets() {
  const response = await fetch("/api/admin/local-assets", {
    headers: { "X-Admin-Request": "1" },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "Could not list the project's bundled images.");
  }
  return payload.assets;
}

function safeUploadName(rawName) {
  const dot = rawName.lastIndexOf(".");
  const extension = dot >= 0 ? rawName.slice(dot).toLowerCase() : "";
  const stem =
    (dot >= 0 ? rawName.slice(0, dot) : rawName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "upload";
  return `${stem}${extension}`;
}

/** Uploads into `uploads/`, never overwriting — a name collision gains a number. */
export async function uploadAsset(file) {
  const client = requireSupabase();
  const name = safeUploadName(file.name);
  const dot = name.lastIndexOf(".");
  const stem = dot >= 0 ? name.slice(0, dot) : name;
  const extension = dot >= 0 ? name.slice(dot) : "";

  for (let n = 1; n < 500; n += 1) {
    const candidate = n === 1 ? `uploads/${stem}${extension}` : `uploads/${stem}-${n}${extension}`;
    const { error } = await client.storage.from(BUCKET).upload(candidate, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

    if (!error) return { asset: { path: candidate, size: file.size } };
    // "already exists" is the only error worth retrying under a new name.
    if (!/exists/i.test(error.message)) throw new Error(error.message);
  }

  throw new Error("Too many files already share that name.");
}

/* ---------------------------------------------------------------------------
   Build

   Still a local, dev-only call: producing `dist/` runs the project's own Vite
   toolchain, which only exists on this machine. Everything above it — sign
   in, edit, save — works from anywhere Supabase is reachable.
   ------------------------------------------------------------------------ */

export async function buildSite() {
  const response = await fetch("/api/admin/build", {
    method: "POST",
    headers: { "X-Admin-Request": "1" },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message ||
        "Could not reach the local build server. Run `npm run dev` on this machine to use Build site.",
    );
  }
  return payload;
}

/**
 * The five most recent saves, for the dashboard's "Recent activity" card.
 * Read-only, and only ever the most recent handful — this is a glance, not an
 * audit log browser.
 */
export async function loadRecentHistory(limit = 5) {
  const { data, error } = await requireSupabase()
    .from("site_content_history")
    .select("saved_at")
    .order("saved_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data;
}

export { supabase };
