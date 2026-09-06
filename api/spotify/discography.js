import { getDiscography } from "../../server/spotify.mjs";

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "private, max-age=300",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { message: "Method not allowed." });
    return;
  }

  try {
    sendJson(response, 200, await getDiscography());
  } catch (error) {
    sendJson(response, error.status || 500, {
      message: error.message || "Unable to load the Spotify catalog.",
    });
  }
}
