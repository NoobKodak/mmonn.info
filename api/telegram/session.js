import { handleTelegramEditorRequest } from "../../server/telegram-editor.mjs";

// This route reads the request body itself (readJson/readBody in
// telegram-editor.mjs), so Vercel must not pre-parse and consume the stream.
export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  await handleTelegramEditorRequest(request, response, "/api/telegram/session");
}
