/**
 * Refresh the saved CD shelf from public Spotify release pages when Web API
 * access is unavailable. The reviewed inventory is explicit: this does not
 * pretend to discover future releases or assert market-wide completeness.
 * Only public release metadata is retained, never embed session settings.
 */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";

const artistId = "57wPsYZkEErG0C2ntgqNTe";
const inventory = JSON.parse(await readFile("src/data/spotify-release-inventory.json", "utf8"));
const clean = (value) => String(value || "").replace(/[\uFFFD\u00a0]/g, " ").replace(/\s+/g, " ").trim();

async function page(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Public Spotify page unavailable (${response.status}): ${url}`);
  return response.text();
}

async function readRelease(id) {
  if (!/^[A-Za-z0-9]{22}$/.test(id)) throw new Error("Invalid reviewed album ID.");
  const [embed, html] = await Promise.all([
    page(`https://open.spotify.com/embed/album/${id}`),
    page(`https://open.spotify.com/album/${id}`),
  ]);
  const script = embed.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!script) throw new Error(`No public embed metadata for ${id}; saved catalog was not replaced.`);
  const entity = JSON.parse(script[1]).props?.pageProps?.state?.data?.entity;
  const releaseDate = html.match(/<meta\s+name="music:release_date"\s+content="([\d-]+)"/)?.[1];
  if (entity?.id !== id || !Array.isArray(entity.trackList) || !releaseDate) {
    throw new Error(`Incomplete public release metadata for ${id}; saved catalog was not replaced.`);
  }
  const cover = [...(entity.visualIdentity?.image || [])].sort((a, b) => b.maxWidth - a.maxWidth)[0]?.url;
  const tracks = entity.trackList.flatMap((track, index) => {
    const artists = clean(track.subtitle).split(",").map(clean).filter(Boolean);
    if (!artists.some((artist) => artist.toLowerCase() === "mmonn")) return [];
    const trackId = track.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
    if (!trackId || !clean(track.title)) throw new Error(`Invalid track in ${id}`);
    return [{
      id: trackId,
      name: clean(track.title),
      artists,
      releaseDate,
      durationMs: track.duration,
      explicit: Boolean(track.isExplicit),
      spotifyUrl: `https://open.spotify.com/track/${trackId}`,
      album: { id, name: clean(entity.name), image: `covers/${trackId}.jpg` },
      coverRemote: cover,
      trackNumber: index + 1,
    }];
  });
  if (!tracks.length || !cover) throw new Error(`No credited MMONN tracks or artwork in ${id}`);
  console.log(`${clean(entity.name)}: ${tracks.length} MMONN track(s), ${releaseDate}`);
  return tracks;
}

// Keep requests bounded and retain inventory order until sorting by date.
const releases = new Array(inventory.albumIds.length);
let cursor = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (cursor < inventory.albumIds.length) {
    const index = cursor++;
    releases[index] = await readRelease(inventory.albumIds[index]);
  }
}));

const sorted = releases.flat().sort((a, b) =>
  b.releaseDate.localeCompare(a.releaseDate) ||
  a.album.name.localeCompare(b.album.name) || a.trackNumber - b.trackNumber,
);
// Album and single editions can have different Spotify IDs for the same song.
// Preserve the newest edition; distinct collaborators keep original/remix apart.
const seen = new Set();
const tracks = sorted.filter((track) => {
  const key = `${track.name.toLowerCase()}|${track.artists.map((artist) => artist.toLowerCase()).sort().join(",")}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

await mkdir("public/covers", { recursive: true });
for (const track of tracks) {
  const response = await fetch(track.coverRemote, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cover download failed for ${track.name}; saved catalog was not replaced.`);
  await writeFile(`public/${track.album.image}`, Buffer.from(await response.arrayBuffer()));
  delete track.coverRemote;
  delete track.trackNumber;
}
const result = {
  artist: { name: "MMONN", id: artistId, spotifyUrl: `https://open.spotify.com/artist/${artistId}` },
  source: "public-spotify-pages",
  isCompleteCatalog: false,
  fetchedAt: new Date().toISOString(),
  inventoryCheckedAt: inventory.checkedAt,
  releaseSources: inventory.albumIds.map((id) => `https://open.spotify.com/album/${id}`),
  tracks,
};
await writeFile("src/data/spotify.json.tmp", `${JSON.stringify(result, null, 2)}\n`);
await rename("src/data/spotify.json.tmp", "src/data/spotify.json");
console.log(`Saved ${tracks.length} unique MMONN songs from ${inventory.albumIds.length} verified releases, newest first.`);
