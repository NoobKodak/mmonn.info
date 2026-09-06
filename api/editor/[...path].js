import { handleTelegramEditorRequest } from "../../server/telegram-editor.mjs";

// Uploads and JSON bodies are read manually inside telegram-editor.mjs
// (multipart parsing needs the raw, unconsumed stream), so Vercel must not
// pre-parse the body here.
export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  // `request.url` still carries the real incoming path and query string
  // (e.g. "/api/editor/assets?source=local") regardless of the catch-all
  // filename that routed here, so pathname is derived from it directly
  // rather than reassembled from Vercel's parsed [...path] segments.
  const pathname = new URL(request.url, "http://localhost").pathname;
  await handleTelegramEditorRequest(request, response, pathname);
}
