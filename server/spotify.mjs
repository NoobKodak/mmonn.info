const ARTIST_ID = "57wPsYZkEErG0C2ntgqNTe";
const CATALOG_CACHE_MS = 15 * 60 * 1000;
const TOKEN_EARLY_REFRESH_MS = 60 * 1000;
// Spotify sends a `next` URL for each page. This is a circuit breaker rather
// than a catalog limit: if it ever fires, return an error instead of silently
// omitting releases.
const MAX_SPOTIFY_PAGES = 1_000;
const ALBUM_FETCH_CONCURRENCY = 4;

let tokenCache = { accessToken: null, expiresAt: 0 };
let catalogCache = { payload: null, expiresAt: 0, request: null };

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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

export async function getDiscography() {
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
