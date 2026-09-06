import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

import { handleTelegramEditorRequest } from "./server/telegram-editor.mjs";

const ROOT = process.cwd();
const DIST_DIRECTORY = resolve(ROOT, "dist");
const ARTIST_ID = "57wPsYZkEErG0C2ntgqNTe";
const CATALOG_CACHE_MS = 15 * 60 * 1000;
const TOKEN_EARLY_REFRESH_MS = 60 * 1000;
// Spotify sends a `next` URL for each page. This is a circuit breaker rather
// than a catalog limit: if it ever fires, return an error instead of silently
// omitting releases.
const MAX_SPOTIFY_PAGES = 1_000;
const ALBUM_FETCH_CONCURRENCY = 4;
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

let tokenCache = { accessToken: null, expiresAt: 0 };
let catalogCache = { payload: null, expiresAt: 0, request: null };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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

function spotifyConfig() {
  const market = (process.env.SPOTIFY_MARKET || "PH").toUpperCase();
  if (!/^[A-Z]{2}$/.test(market)) {
    throw new HttpError(500, "SPOTIFY_MARKET must be a two-letter country code.");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new HttpError(
      503,
      "The live Spotify catalog is not configured on this server yet.",
    );
  }

  return {
    artistId: process.env.SPOTIFY_ARTIST_ID || ARTIST_ID,
    clientId,
    clientSecret,
    market,
  };
}

async function getSpotifyAccessToken(config) {
  if (
    tokenCache.accessToken &&
    Date.now() < tokenCache.expiresAt - TOKEN_EARLY_REFRESH_MS
  ) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new HttpError(
      502,
      "Spotify could not authorize the catalog request. Check the server credentials.",
    );
  }

  const payload = await response.json();
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 0) * 1000,
  };
  return tokenCache.accessToken;
}

async function spotifyRequest(url, config, allowRefresh = true) {
  const accessToken = await getSpotifyAccessToken(config);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401 && allowRefresh) {
    tokenCache = { accessToken: null, expiresAt: 0 };
    return spotifyRequest(url, config, false);
  }

  if (response.status === 429) {
    throw new HttpError(
      429,
      "Spotify is temporarily rate-limiting catalog requests. Please try again shortly.",
    );
  }

  if (response.status === 403) {
    throw new HttpError(
      503,
      "Spotify requires an active Premium subscription for the account that owns this app before the live catalog can load.",
    );
  }

  if (!response.ok) {
    throw new HttpError(
      502,
      "Spotify could not load the MMONN catalog right now.",
    );
  }

  return response.json();
}

async function spotifyPages(url, config) {
  const items = [];
  let next = url;
  let pageCount = 0;
  const visitedUrls = new Set();

  while (next) {
    if (pageCount >= MAX_SPOTIFY_PAGES || visitedUrls.has(next)) {
      throw new HttpError(
        502,
        "Spotify catalog pagination stopped before every page could be read.",
      );
    }

    visitedUrls.add(next);
    const page = await spotifyRequest(next, config);
    items.push(...(page.items || []));
    next = page.next;
    pageCount += 1;
  }

  return items;
}

async function mapWithConcurrency(items, mapItem, limit = ALBUM_FETCH_CONCURRENCY) {
  const output = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await mapItem(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return output;
}

function normalizedCover(images) {
  return images?.find((image) => image.width >= 300)?.url || images?.[0]?.url || null;
}

function normalizedTrack(track, album) {
  return {
    id: track.id,
    name: track.name,
    artists: (track.artists || []).map((artist) => artist.name),
    album: {
      id: album.id,
      name: album.name,
      releaseDate: album.release_date,
      type: album.album_type || album.album_group || "release",
      image: normalizedCover(album.images),
      spotifyUrl: album.external_urls?.spotify || null,
    },
    discNumber: track.disc_number,
    trackNumber: track.track_number,
    releaseDate: album.release_date,
    spotifyUrl: track.external_urls?.spotify || album.external_urls?.spotify || null,
  };
}

async function fetchDiscography() {
  const config = spotifyConfig();
  const albumsUrl = new URL(
    `https://api.spotify.com/v1/artists/${encodeURIComponent(config.artistId)}/albums`,
  );
  albumsUrl.search = new URLSearchParams({
    include_groups: "album,single,appears_on,compilation",
    limit: "10",
    market: config.market,
  }).toString();

  const catalogAlbums = await spotifyPages(albumsUrl.toString(), config);
  const albums = [...new Map(catalogAlbums.map((album) => [album.id, album])).values()];
  const tracksByAlbum = await mapWithConcurrency(albums, async (album) => {
    const tracksUrl = new URL(
      `https://api.spotify.com/v1/albums/${encodeURIComponent(album.id)}/tracks`,
    );
    tracksUrl.search = new URLSearchParams({
      limit: "50",
      market: config.market,
    }).toString();
    const tracks = await spotifyPages(tracksUrl.toString(), config);
    return tracks
      .filter((track) => track.artists?.some((artist) => artist.id === config.artistId))
      .map((track) => normalizedTrack(track, album));
  });

  const tracks = [
    ...new Map(
      tracksByAlbum.flat().map((track) => [track.id, track]),
    ).values(),
  ].sort((first, second) => {
    const dateOrder = String(second.releaseDate).localeCompare(String(first.releaseDate));
    if (dateOrder) return dateOrder;
    const albumOrder = first.album.name.localeCompare(second.album.name);
    if (albumOrder) return albumOrder;
    return first.trackNumber - second.trackNumber;
  });

  return {
    artist: {
      id: config.artistId,
      name: "MMONN",
      spotifyUrl: `https://open.spotify.com/artist/${config.artistId}`,
    },
    isCompleteCatalog: true,
    fetchedAt: new Date().toISOString(),
    tracks,
  };
}

async function getDiscography() {
  if (catalogCache.payload && Date.now() < catalogCache.expiresAt) {
    return catalogCache.payload;
  }

  if (!catalogCache.request) {
    catalogCache.request = fetchDiscography()
      .then((payload) => {
        catalogCache = {
          payload,
          expiresAt: Date.now() + CATALOG_CACHE_MS,
          request: null,
        };
        return payload;
      })
      .catch((error) => {
        catalogCache.request = null;
        throw error;
      });
  }

  return catalogCache.request;
}

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
