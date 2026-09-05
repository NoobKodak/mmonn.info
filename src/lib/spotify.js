import { publicAsset } from "../assets.js";
import catalog from "../data/spotify.json";

/**
 * Spotify credentials stay on the server. The browser asks our local catalog
 * endpoint, which walks every page of MMONN releases and tracks. The generated
 * JSON is intentionally retained as a fallback for static deployments and
 * temporary Spotify access outages, so the music page never becomes blank.
 */
const CATALOG_ENDPOINT = "/api/spotify/discography";

class CatalogRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CatalogRequestError";
    this.status = status;
  }
}

function isRemoteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function withResolvedArtwork(payload) {
  return {
    ...payload,
    tracks: (payload.tracks || []).map((track) => ({
      ...track,
      album: {
        ...track.album,
        // The live API returns Spotify CDN URLs; the cache stores public paths.
        image: track.album?.image
          ? isRemoteUrl(track.album.image)
            ? track.album.image
            : publicAsset(track.album.image)
          : null,
      },
    })),
  };
}

async function requestCatalog(signal) {
  const response = await fetch(CATALOG_ENDPOINT, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CatalogRequestError(
      body?.message || "The live Spotify catalog is unavailable right now.",
      response.status,
    );
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.tracks)) {
    throw new CatalogRequestError(
      "Spotify returned an invalid catalog response.",
      response.status,
    );
  }

  return withResolvedArtwork(payload);
}

export async function fetchSpotifyDiscography({ signal } = {}) {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  try {
    return await requestCatalog(signal);
  } catch (error) {
    if (error.name === "AbortError") throw error;

    // Keep the site useful if the host has no Node endpoint or Spotify
    // temporarily denies a live request. The cache is never labelled as a
    // complete live response, so the UI can describe it honestly.
    if (
      error instanceof CatalogRequestError ||
      error instanceof TypeError ||
      error instanceof SyntaxError
    ) {
      return withResolvedArtwork({
        ...catalog,
        isCachedFallback: true,
        liveCatalogError: error.message || null,
      });
    }

    throw error;
  }
}
