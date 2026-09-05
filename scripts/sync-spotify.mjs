/**
 * Builds the complete MMONN Spotify catalog into `src/data/spotify.json` and
 * downloads its cover art to `public/covers/` for static hosting.
 *
 * Run at build time only:
 *
 *     npm run sync:spotify
 *
 * It deliberately uses the Artist Albums and Album Tracks endpoints rather
 * than Spotify's Top Tracks endpoint, which is limited to ten results.
 * Credentials are read only from the process environment or ignored `.env`
 * files and never written into the generated JSON or client bundle.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ARTIST_ID = "57wPsYZkEErG0C2ntgqNTe";
const OUT_JSON = "src/data/spotify.json";
const COVER_DIR = "public/covers";
const USER_AGENT = "Mozilla/5.0 (compatible; mmonn-site-build)";
const MAX_SPOTIFY_PAGES = 1_000;
const ALBUM_FETCH_CONCURRENCY = 4;

class SpotifyAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = "SpotifyAccessError";
  }
}

async function readEnvironmentFile(name) {
  try {
    const source = await readFile(name, "utf8");
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

function spotifyConfig() {
  const market = (process.env.SPOTIFY_MARKET || "PH").toUpperCase();
  if (!/^[A-Z]{2}$/.test(market)) {
    throw new Error("SPOTIFY_MARKET must be a two-letter country code.");
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "A complete sync requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the build environment.",
    );
  }

  return {
    artistId: process.env.SPOTIFY_ARTIST_ID || ARTIST_ID,
    clientId,
    clientSecret,
    market,
  };
}

async function getAccessToken({ clientId, clientSecret }) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new Error("Spotify could not authorize this catalog sync.");
  }

  const payload = await response.json();
  return payload.access_token;
}

async function spotifyRequest(url, accessToken) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 403) {
    throw new SpotifyAccessError(
      "Spotify denied this catalog request. The Spotify app owner needs the required active Premium/API access before a complete catalog can be synchronized.",
    );
  }

  if (response.status === 429) {
    throw new Error("Spotify is rate-limiting the catalog sync. Please try again shortly.");
  }

  if (!response.ok) {
    throw new Error(`Spotify catalog request failed (${response.status}).`);
  }

  return response.json();
}

async function spotifyPages(initialUrl, accessToken) {
  const items = [];
  const visitedUrls = new Set();
  let next = initialUrl;
  let pageCount = 0;

  while (next) {
    if (pageCount >= MAX_SPOTIFY_PAGES || visitedUrls.has(next)) {
      throw new Error("Spotify catalog pagination stopped before every page could be read.");
    }

    visitedUrls.add(next);
    const page = await spotifyRequest(next, accessToken);
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

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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
    releaseDate: album.release_date,
    durationMs: track.duration_ms ?? null,
    explicit: Boolean(track.explicit),
    spotifyUrl: track.external_urls?.spotify || album.external_urls?.spotify || null,
    album: {
      id: album.id,
      name: album.name,
      type: album.album_type || album.album_group || "release",
      image: null,
    },
    coverRemote: normalizedCover(album.images),
    discNumber: track.disc_number,
    trackNumber: track.track_number,
  };
}

async function fetchDiscography(config) {
  const accessToken = await getAccessToken(config);
  const albumsUrl = new URL(
    `https://api.spotify.com/v1/artists/${encodeURIComponent(config.artistId)}/albums`,
  );
  albumsUrl.search = new URLSearchParams({
    include_groups: "album,single,appears_on,compilation",
    // Spotify currently caps this endpoint at ten items per response; the
    // `next` loop above continues until every page is consumed.
    limit: "10",
    market: config.market,
  }).toString();

  const catalogAlbums = await spotifyPages(albumsUrl.toString(), accessToken);
  const albums = [...new Map(catalogAlbums.map((album) => [album.id, album])).values()];
  const tracksByAlbum = await mapWithConcurrency(albums, async (album) => {
    const tracksUrl = new URL(
      `https://api.spotify.com/v1/albums/${encodeURIComponent(album.id)}/tracks`,
    );
    tracksUrl.search = new URLSearchParams({
      limit: "50",
      market: config.market,
    }).toString();

    const tracks = await spotifyPages(tracksUrl.toString(), accessToken);
    return tracks
      .filter((track) => track.artists?.some((artist) => artist.id === config.artistId))
      .map((track) => normalizedTrack(track, album));
  });

  const tracks = [
    ...new Map(tracksByAlbum.flat().map((track) => [track.id, track])).values(),
  ].sort((first, second) => {
    const dateOrder = String(second.releaseDate).localeCompare(String(first.releaseDate));
    if (dateOrder) return dateOrder;
    const albumOrder = first.album.name.localeCompare(second.album.name);
    if (albumOrder) return albumOrder;
    return first.trackNumber - second.trackNumber;
  });

  return { tracks };
}

async function downloadCover(url, id) {
  if (!url) return null;
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return null;

  const file = `${id}.jpg`;
  await writeFile(join(COVER_DIR, file), Buffer.from(await response.arrayBuffer()));
  return `covers/${file}`;
}

async function syncCatalog() {
  await loadLocalEnvironment();
  const config = spotifyConfig();
  const result = await fetchDiscography(config);

  console.log(`Synchronizing ${result.tracks.length} MMONN Spotify songs…`);
  await mkdir(COVER_DIR, { recursive: true });

  for (const track of result.tracks) {
    track.album.image = await downloadCover(track.coverRemote, track.id);
    delete track.coverRemote;
    delete track.discNumber;
    delete track.trackNumber;
    console.log(`  ${track.album.image ? "✓" : "·"} ${track.name} — ${track.album.name ?? "?"}`);
  }

  await writeFile(
    OUT_JSON,
    `${JSON.stringify(
      {
        artist: {
          name: "MMONN",
          id: config.artistId,
          spotifyUrl: `https://open.spotify.com/artist/${config.artistId}`,
        },
        source: "api",
        isCompleteCatalog: true,
        fetchedAt: new Date().toISOString(),
        tracks: result.tracks,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${OUT_JSON}`);
}

try {
  await syncCatalog();
} catch (error) {
  if (!(error instanceof SpotifyAccessError)) throw error;

  // Keep the last good catalog intact so a deployment never fails merely
  // because Spotify is withholding a temporary catalog response.
  const savedCatalog = JSON.parse(await readFile(OUT_JSON, "utf8"));
  const songCount = savedCatalog.tracks?.length || 0;
  console.warn(
    `Spotify access is unavailable. Kept the saved ${songCount}-song catalog instead.`,
  );
}
