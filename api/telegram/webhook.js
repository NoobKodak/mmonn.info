import { handleTelegramEditorRequest } from "../../server/telegram-editor.mjs";

export const config = { api: { bodyParser: false } };

export default async function handler(request, response) {
  await handleTelegramEditorRequest(request, response, "/api/telegram/webhook");
}
