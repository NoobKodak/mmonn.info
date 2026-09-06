/**
 * Compatibility entry point for the editor API.
 *
 * The former implementation authenticated and mutated Supabase directly from
 * the browser. That path has been retired: all calls now go through the
 * Telegram-verified server adapter, which never exposes a service-role key or
 * a browser sign-up flow.
 */
export {
  endSession,
  getSession,
  loadAssets,
  loadContent,
  loadLocalAssets,
  loadRecentHistory,
  previewUrl,
  publishContent,
  restoreVersion,
  saveContent,
  uploadAsset,
} from "./telegram-api.js";
