import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { handleTelegramEditorRequest } from "./server/telegram-editor.mjs";
import { getDiscography } from "./server/spotify.mjs";

const ROOT = process.cwd();
const DIST_DIRECTORY = resolve(ROOT, "dist");
const isProduction = process.argv.includes("--production");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function readEnvironmentFile(name) {
  try {
    const source = await readFile(join(ROOT, name), "utf8");
    return Object.fromEntries(
      source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.replace(/^export\s+/, ""))
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator < 1) return null;

          const key = line.slice(0, separator).trim();
          let value = line.slice(separator + 1).trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          return [key, value];
        })
        .filter(Boolean),
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function loadLocalEnvironment() {
  const values = {
    ...(await readEnvironmentFile(".env")),
    ...(await readEnvironmentFile(".env.local")),
  };

  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

await loadLocalEnvironment();

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "private, max-age=300",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function pathInside(directory, pathname) {
  const normalizedPath = normalize(pathname).replace(/^(\.\.(?:[\\/]|$))+/, "");
  const resolvedPath = resolve(directory, normalizedPath.replace(/^[\\/]+/, ""));
  return resolvedPath.startsWith(`${directory}${process.platform === "win32" ? "\\" : "/"}`)
    ? resolvedPath
    : null;
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const pathname = decodeURIComponent(requestUrl.pathname);
  let filePath = pathInside(DIST_DIRECTORY, pathname === "/" ? "index.html" : pathname);

  try {
    if (!filePath || !(await stat(filePath)).isFile()) {
      filePath = join(DIST_DIRECTORY, "index.html");
    }
    await access(filePath);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(filePath).pipe(response);
}

let vite;
if (!isProduction) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    appType: "spa",
    server: {
      middlewareMode: true,
      watch: { usePolling: true, interval: 1000 },
    },
  });
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");

  // The Telegram editor is deliberately handled before any local/dev helpers:
  // its mutations authenticate against Telegram and then use a server-only
  // Supabase service key. No private editor route falls through to Vite.
  if (await handleTelegramEditorRequest(request, response, requestUrl.pathname)) {
    return;
  }

  if (requestUrl.pathname === "/api/spotify/discography") {
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
    return;
  }

  if (vite) {
    vite.middlewares(request, response, () => {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });
    return;
  }

  await serveStatic(request, response);
});

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
server.listen(port, host, () => {
  const printedHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`MMONN profile server running at http://${printedHost}:${port}`);
  if (!isProduction) {
    console.log(`Telegram editor:              http://${printedHost}:${port}/admin.html`);
  }
});
