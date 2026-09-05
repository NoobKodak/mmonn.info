import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for the browser.
 *
 * This project is Vite + React, not Next.js, so there is no `@supabase/ssr`,
 * no server client, and no middleware: those exist to carry an auth session
 * through server-rendered requests, and nothing here renders on a server. The
 * single browser client below is the whole integration.
 *
 * Only the publishable key is used. Vite inlines every `VITE_`-prefixed
 * variable into the bundle it ships, so a secret key here would be readable by
 * anyone who opens the site. Secrets belong to server-side code, which reads
 * them from `process.env` without the prefix.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** True when the project has been configured, so callers can degrade politely. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey)
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.",
    );
  }
  return supabase;
}
