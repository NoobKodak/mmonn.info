/**
 * Admin support server.
 *
 * Content and asset writes go straight from the browser to Supabase — see
 * src/admin/api.js — so this file only has two jobs, both dev-only:
 *
 *  - list the images already bundled in `public/`, so the panel's asset
 *    picker can offer the project's own default artwork (the shared polaroid
 *    frame, milestone backgrounds, ...) alongside anything uploaded to
 *    Supabase Storage. This is read-only and exposes nothing private: `public/`
 *    is already served to every visitor of the site itself.
 *  - run a production build into `dist/`, for the one deployment shape that
 *    isn't this Node server.
 *
 * Mounted only in development. A deployed copy of the site never exposes
 * either endpoint.
 */
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIRECTORY = resolve(HERE, "public");
const ASSET_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".avif"]);

/**
 * A browser will happily send a cross-site POST to localhost. Requiring a
 * custom header defeats that: adding one forces a CORS preflight, and no CORS
 * headers are ever returned, so the preflight fails and the real request is
 * never sent. The Origin check closes the same door from the other side.
 */
function isTrustedRequest(request) {
  if (request.headers["x-admin-request"] !== "1") return false;

  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

async function listLocalAssets() {
  const found = [];

  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = join(directory, entry.name);
      const path = relative(PUBLIC_DIRECTORY, full).split(sep).join("/");

      // `uploads/` is exclusively the Supabase Storage bucket's namespace —
      // src/lib/content-asset.js resolves any path with that prefix there,
      // never locally. A `public/uploads/` folder can still exist as a
      // leftover from before that convention; walking into it would collide
      // path-for-path with real bucket entries and list a file nothing will
      // ever actually load from here.
      if (entry.isDirectory()) {
        if (path === "uploads") continue;
        await walk(full);
      } else if (ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const { size } = await stat(full);
        found.push({ path, size });
      }
    }
  }

  await walk(PUBLIC_DIRECTORY);
  return found.sort((first, second) => first.path.localeCompare(second.path));
}

function runBuild() {
  return new Promise((settle) => {
    const child = spawn(
      process.execPath,
      [resolve(HERE, "node_modules/vite/bin/vite.js"), "build"],
      {
        cwd: HERE,
        stdio: ["ignore", "pipe", "pipe"],
        // The dev server runs with NODE_ENV=development, and a child process
        // inherits it. Left alone, the build would bundle React's development
        // copy — roughly double the size, slower, and full of dev warnings.
        env: { ...process.env, NODE_ENV: "production" },
      },
    );

    let output = "";
    const collect = (chunk) => {
      output += chunk;
      if (output.length > 20000) output = output.slice(-20000);
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => settle({ ok: false, output: String(error) }));
    child.on("close", (code) => settle({ ok: code === 0, output: output.trim() }));
  });
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

/**
 * Returns true when the request was an admin route and has been handled.
 * `server.mjs` calls this before its own routing, and only in development.
 */
export async function handleAdminRequest(request, response, pathname) {
  if (pathname !== "/api/admin/build" && pathname !== "/api/admin/local-assets") {
    return false;
  }

  if (!isTrustedRequest(request)) {
    send(response, 403, { message: "Admin requests must come from the editor on this machine." });
    return true;
  }

  if (pathname === "/api/admin/local-assets") {
    if (request.method !== "GET") {
      send(response, 405, { message: "Method not allowed." });
      return true;
    }
    send(response, 200, { assets: await listLocalAssets() });
    return true;
  }

  if (request.method !== "POST") {
    send(response, 405, { message: "Method not allowed." });
    return true;
  }

  const result = await runBuild();
  send(response, result.ok ? 200 : 500, {
    ok: result.ok,
    output: result.output,
    message: result.ok ? "Site rebuilt into dist/." : "The build failed.",
  });
  return true;
}
