import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

import { validateContent } from "../src/admin/validate.js";
import {
  TelegramAuthError,
  createEditorSession,
  parseAdminIds,
  requireAllowedTelegramUser,
  verifyEditorSession,
  verifyTelegramInitData,
} from "./telegram-auth.mjs";

// Read relative to this module's own location (rather than fs.readFile
// against a process.cwd()-relative path, or a JSON import attribute) so this
// bundles correctly into a Vercel serverless function: process.cwd() is not
// guaranteed to be the repo root at runtime there, and `with { type: "json" }`
// import syntax was found to silently break that function's build.
const defaultContent = JSON.parse(
  readFileSync(new URL("../src/data/content.json", import.meta.url), "utf8"),
);

const ROOT = process.cwd();
const PUBLIC_DIRECTORY = resolve(ROOT, "public");
const COOKIE_NAME = "mmonn_editor";
const CONTENT_ID = "live";
const MAX_JSON_BYTES = 1_000_000;
// Vercel Serverless Functions cap request bodies well below what a
// Node-hosted server would allow (historically ~4.5MB), so this stays
// comfortably under that ceiling rather than accepting uploads the platform
// itself would reject before this code ever runs.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const SESSION_TTL_SECONDS = 2 * 60 * 60;
const ASSET_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp", ".avif"]);
const CONTENT_TYPES = new Map([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);
const rateWindows = new Map();

function isProductionRuntime() {
  return process.argv.includes("--production") || process.env.NODE_ENV === "production";
}

function useSecureCookie() {
  // server.mjs loads .env.local after importing this module, so the
  // environment must be read when a cookie is issued rather than at import.
  return (
    isProductionRuntime() ||
    /^https:/i.test(process.env.PUBLIC_SITE_URL || "")
  );
}

function httpsUrl(name, rawValue) {
  try {
    const url = new URL(rawValue);
    if (url.protocol !== "https:") throw new Error("not https");
    return url;
  } catch {
    throw new HttpError(503, `${name} must be a valid HTTPS URL in production.`);
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function parseCookies(header = "") {
  return Object.fromEntries(
    String(header)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return null;
        try {
          return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );
}

function editorConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const sessionSecret = process.env.TELEGRAM_SESSION_SECRET;
  const adminIds = parseAdminIds(process.env.TELEGRAM_ADMIN_IDS);

  if (!botToken) throw new HttpError(503, "Telegram editor is not configured on this server.");
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new HttpError(503, "Telegram editor needs a server-only TELEGRAM_SESSION_SECRET.");
  }
  // This installation has a single owner. An empty or multi-account value
  // must never become an accidental "any signed-in Telegram user" policy.
  if (adminIds.size !== 1) {
    throw new HttpError(
      503,
      "Telegram editor access is closed until exactly one TELEGRAM_ADMIN_IDS value is configured.",
    );
  }

  if (isProductionRuntime()) {
    const publicUrl = httpsUrl("PUBLIC_SITE_URL", process.env.PUBLIC_SITE_URL);
    const webAppUrl = httpsUrl("TELEGRAM_WEB_APP_URL", process.env.TELEGRAM_WEB_APP_URL);
    if (publicUrl.origin !== webAppUrl.origin) {
      throw new HttpError(503, "TELEGRAM_WEB_APP_URL must use the PUBLIC_SITE_URL origin in production.");
    }
  }

  return { botToken, sessionSecret, adminIds };
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new HttpError(503, "The secure editor needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function sessionCookie(token) {
  const attributes = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (useSecureCookie()) attributes.push("Secure");
  return attributes.join("; ");
}

function expiredSessionCookie() {
  const attributes = [`${COOKIE_NAME}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Strict"];
  if (useSecureCookie()) attributes.push("Secure");
  return attributes.join("; ");
}

function clientAddress(request) {
  // Behind Vercel (and most reverse proxies), the socket's remote address is
  // the proxy itself — the real client IP arrives via this header instead.
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket?.remoteAddress || "unknown";
}

function enforceRateLimit(request, scope, { max = 12, windowMs = 5 * 60 * 1000 } = {}) {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > max) {
    throw new HttpError(429, "Too many editor requests. Please wait a moment and try again.");
  }

  // Keep the in-memory limiter bounded during a long-running deployment.
  if (rateWindows.size > 5000) {
    for (const [storedKey, value] of rateWindows) {
      if (value.resetAt <= now) rateWindows.delete(storedKey);
    }
  }
}

async function readBody(request, limit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new HttpError(413, "The request is larger than this editor can accept.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new HttpError(400, "The editor request must contain valid JSON.");
  }
}

function requestOriginIsTrusted(request) {
  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const publicUrl = process.env.PUBLIC_SITE_URL;
    if (publicUrl) return originUrl.origin === new URL(publicUrl).origin;
    return ["localhost", "127.0.0.1", "[::1]"].includes(originUrl.hostname);
  } catch {
    return false;
  }
}

function requireEditorRequest(request) {
  if (request.headers["x-mmonn-editor"] !== "1" || !requestOriginIsTrusted(request)) {
    throw new HttpError(403, "This action must come from the MMONN Telegram editor.");
  }
}

function requireEditorSession(request) {
  const { sessionSecret, adminIds } = editorConfig();
  const token = parseCookies(request.headers.cookie)[COOKIE_NAME];
  const user = verifyEditorSession(token, sessionSecret);
  if (!user) throw new HttpError(401, "Your editor session has expired. Reopen the editor from Telegram.");
  try {
    return requireAllowedTelegramUser(user, adminIds);
  } catch (error) {
    if (error instanceof TelegramAuthError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

function publicUser(user) {
  return { id: user.id, name: user.name, username: user.username };
}

async function getDefaultContent() {
  return defaultContent;
}

/** Merges only known defaults. Arrays intentionally replace as whole lists. */
function mergeWithDefaults(defaultValue, storedValue) {
  if (Array.isArray(defaultValue)) return Array.isArray(storedValue) ? storedValue : defaultValue;
  if (!defaultValue || typeof defaultValue !== "object") {
    return storedValue === undefined ? defaultValue : storedValue;
  }
  const stored = storedValue && typeof storedValue === "object" && !Array.isArray(storedValue) ? storedValue : {};
  return Object.fromEntries(
    Object.entries(defaultValue).map(([key, value]) => [key, mergeWithDefaults(value, stored[key])]),
  );
}

async function normalizedContent(content) {
  const defaults = await getDefaultContent();
  const normalized = mergeWithDefaults(defaults, content);
  const mediaDefault = { spotifyEmbedUrl: "", youtubeEmbedUrl: "", youtubeLabel: "" };
  const frameDefault = { src: "", width: 0, height: 0, window: { top: 6, side: 6, bottom: 18 } };
  const defaultsById = new Map(defaults.collaborations.map((entry) => [entry.id, entry]));

  return {
    ...normalized,
    collaborations: normalized.collaborations.map((entry) => {
      const fallback = defaultsById.get(entry.id) || {};
      return {
        ...fallback,
        ...entry,
        media: { ...mediaDefault, ...fallback.media, ...entry.media },
        frame: mergeWithDefaults(frameDefault, { ...fallback.frame, ...entry.frame }),
      };
    }),
  };
}

async function listStorageAssets(client) {
  const found = [];
  async function walk(prefix) {
    const { data, error } = await client.storage.from("site-assets").list(prefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new HttpError(502, error.message);
    for (const entry of data || []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) await walk(path);
      else found.push({ path, size: entry.metadata?.size ?? 0 });
    }
  }
  await walk("");
  return found.sort((first, second) => first.path.localeCompare(second.path));
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
      if (entry.isDirectory()) {
        if (path !== "uploads") await walk(full);
      } else if (ASSET_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        found.push({ path, size: (await stat(full)).size });
      }
    }
  }
  await walk(PUBLIC_DIRECTORY);
  return found.sort((first, second) => first.path.localeCompare(second.path));
}

function safeUploadName(rawName) {
  const name = String(rawName || "asset");
  const extension = extname(name).toLowerCase();
  if (!ASSET_EXTENSIONS.has(extension)) {
    throw new HttpError(400, "Use a PNG, JPG, GIF, SVG, WebP, or AVIF file.");
  }
  const stem = name
    .slice(0, -extension.length)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "upload";
  return `${stem}${extension}`;
}

function parseMultipartFile(body, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || "");
  if (!boundaryMatch) throw new HttpError(400, "The upload is missing its multipart boundary.");
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = body.toString("latin1").split(`--${boundary}`);

  for (const chunk of chunks) {
    const separator = chunk.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headers = chunk.slice(0, separator);
    const disposition = /content-disposition:\s*form-data;[^\r\n]*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
    if (!disposition || disposition[1] !== "file" || !disposition[2]) continue;

    const type = /content-type:\s*([^\r\n;]+)/i.exec(headers)?.[1]?.toLowerCase() || "";
    let binary = chunk.slice(separator + 4);
    if (binary.endsWith("\r\n")) binary = binary.slice(0, -2);
    return { filename: disposition[2], type, body: Buffer.from(binary, "latin1") };
  }
  throw new HttpError(400, "Choose one media file to upload.");
}

function hasBytes(body, bytes, offset = 0) {
  return bytes.every((value, index) => body[offset + index] === value);
}

function validateUploadBytes(file, extension) {
  const { body } = file;
  let valid = false;

  if (extension === ".gif") valid = body.subarray(0, 6).toString("ascii") === "GIF87a" || body.subarray(0, 6).toString("ascii") === "GIF89a";
  if (extension === ".png") valid = hasBytes(body, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === ".jpg" || extension === ".jpeg") valid = hasBytes(body, [0xff, 0xd8, 0xff]);
  if (extension === ".webp") {
    valid = body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (extension === ".avif") {
    valid = body.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis"].includes(body.subarray(8, 12).toString("ascii"));
  }
  if (extension === ".svg") {
    const source = body.toString("utf8");
    valid = /<svg[\s>]/i.test(source);
    if (/<script\b|<foreignObject\b|\son\w+\s*=|\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:|data:)/i.test(source)) {
      throw new HttpError(400, "SVG uploads cannot include scripts, event handlers, or external resources.");
    }
  }

  if (!valid) throw new HttpError(400, "The uploaded file does not match its image format.");
}

async function uploadAsset(client, file) {
  if (!file.body.length) throw new HttpError(400, "The selected file is empty.");
  const filename = safeUploadName(file.filename);
  const extension = extname(filename).toLowerCase();
  const allowedType = CONTENT_TYPES.get(extension);
  if (file.type && file.type !== allowedType && file.type !== "application/octet-stream") {
    throw new HttpError(400, "Only image and GIF assets are supported.");
  }
  validateUploadBytes(file, extension);

  const stem = filename.slice(0, -extension.length);
  for (let number = 1; number < 500; number += 1) {
    const candidate = number === 1 ? `uploads/${filename}` : `uploads/${stem}-${number}${extension}`;
    const { error } = await client.storage.from("site-assets").upload(candidate, file.body, {
      upsert: false,
      contentType: allowedType,
      cacheControl: "3600",
    });
    if (!error) return { path: candidate, size: file.body.length };
    if (!/exists|duplicate/i.test(error.message)) throw new HttpError(502, error.message);
  }
  throw new HttpError(409, "Too many uploaded files share this name. Rename the file and try again.");
}

function tableSetupError(error) {
  if (
    error?.code === "42P01" ||
    /relation .* does not exist|could not find the table|could not find the function/i.test(error?.message || "")
  ) {
    return new HttpError(503, "Editor storage is not ready. Apply supabase/telegram-admin.sql, then try again.");
  }
  return new HttpError(502, error?.message || "The editor storage request failed.");
}

async function ensureEditorTables(client) {
  const checks = await Promise.all([
    client.from("editor_content_drafts").select("editor_id").limit(1),
    client.from("editor_content_versions").select("id").limit(1),
    client.from("editor_audit").select("id").limit(1),
  ]);
  const failed = checks.find((result) => result.error);
  if (failed?.error) throw tableSetupError(failed.error);
}

async function loadPublished(client) {
  const { data, error } = await client
    .from("site_content")
    .select("content, updated_at")
    .eq("id", CONTENT_ID)
    .maybeSingle();
  if (error) throw new HttpError(502, error.message);
  if (!data) throw new HttpError(503, 'No "live" row exists in site_content yet.');
  return { content: await normalizedContent(data.content), revision: data.updated_at, publishedAt: data.updated_at };
}

async function loadDraft(client, userId) {
  const { data, error } = await client
    .from("editor_content_drafts")
    .select("content, base_revision, updated_at, editor_name")
    .eq("editor_id", userId)
    .maybeSingle();
  if (error) throw tableSetupError(error);
  if (!data) return null;
  return {
    content: await normalizedContent(data.content),
    baseRevision: data.base_revision,
    updatedAt: data.updated_at,
    editorName: data.editor_name,
  };
}

async function validateEditorContent(client, candidate) {
  const knownAssets = new Set((await listStorageAssets(client)).map((asset) => asset.path));
  try {
    return validateContent(await normalizedContent(candidate), { knownAssets });
  } catch (error) {
    throw new HttpError(400, error.message || "The content did not pass validation.");
  }
}

async function audit(client, user, action, summary, metadata = {}) {
  const { error } = await client.from("editor_audit").insert({
    editor_id: user.id,
    editor_name: user.name,
    action,
    summary,
    metadata,
  });
  if (error) throw tableSetupError(error);
}

function summarizeChange(content) {
  return `Updated ${content.sections.length} public sections`;
}

function optionalDraftRevision(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 80 || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "The draft revision is invalid. Reload the editor and try again.");
  }
  return value;
}

async function saveDraftAtomically(client, {
  content,
  publishedRevision,
  user,
  expectedDraftRevision,
  action,
  summary,
  metadata = {},
}) {
  const { data, error } = await client.rpc("save_telegram_draft", {
    p_content: content,
    p_base_revision: publishedRevision,
    p_editor_id: user.id,
    p_editor_name: user.name,
    p_expected_draft_revision: expectedDraftRevision,
    p_action: action,
    p_summary: summary,
    p_metadata: metadata,
  });
  if (error) {
    if (error.code === "P0001" || /draft changed while/i.test(error.message || "")) {
      throw new HttpError(409, "This draft changed in another editor. Reload before saving again.");
    }
    throw tableSetupError(error);
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.updated_at) throw new HttpError(502, "Saving did not return a draft revision.");
  return result;
}

async function sendTelegramMessage(chatId, text, replyMarkup) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: replyMarkup }),
    });
  } catch {
    // A Telegram delivery failure must not make webhook retries pile up. It is
    // intentionally not logged because error objects can include request URLs.
  }
}

async function handleWebhook(request, response) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret || request.headers["x-telegram-bot-api-secret-token"] !== webhookSecret) {
    throw new HttpError(403, "Webhook verification failed.");
  }
  const update = await readJson(request);
  const message = update?.message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;
  const userId = message?.from?.id;
  if (typeof text === "string" && chatId && userId && text.startsWith("/")) {
    const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();
    const admins = parseAdminIds(process.env.TELEGRAM_ADMIN_IDS);
    if (command === "/edit" || command === "/start") {
      if (!admins.has(String(userId))) {
        void sendTelegramMessage(chatId, "You do not have editor access.");
      } else if (!process.env.TELEGRAM_WEB_APP_URL) {
        void sendTelegramMessage(chatId, "The editor URL has not been configured yet.");
      } else {
        void sendTelegramMessage(chatId, "Open the secure MMONN editor.", {
          inline_keyboard: [[{ text: "Open editor", web_app: { url: process.env.TELEGRAM_WEB_APP_URL } }]],
        });
      }
    } else if (command === "/status") {
      void sendTelegramMessage(
        chatId,
        admins.has(String(userId)) ? "Editor access is active for this Telegram account." : "You do not have editor access.",
      );
    } else if (command === "/help") {
      void sendTelegramMessage(chatId, "Use /edit to open the secure MMONN content editor, or /status to check access.");
    }
  }
  sendJson(response, 200, { ok: true });
}

async function createTelegramSession(request, response) {
  enforceRateLimit(request, "telegram-session");
  const body = await readJson(request);
  const { botToken, sessionSecret, adminIds } = editorConfig();
  let user;
  try {
    user = verifyTelegramInitData(body?.initData, botToken);
    requireAllowedTelegramUser(user, adminIds);
  } catch (error) {
    if (error instanceof TelegramAuthError) throw new HttpError(error.status, error.message);
    throw error;
  }
  const token = createEditorSession(user, sessionSecret, { ttlSeconds: SESSION_TTL_SECONDS });
  sendJson(response, 200, { authorized: true, user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
}

async function handleEditorContent(request, response, pathname) {
  const user = requireEditorSession(request);
  const client = supabaseAdmin();

  if (pathname === "/api/editor/content" && request.method === "GET") {
    await ensureEditorTables(client);
    const [published, draft] = await Promise.all([loadPublished(client), loadDraft(client, user.id)]);
    sendJson(response, 200, { user: publicUser(user), published, draft });
    return;
  }

  if (pathname === "/api/editor/preview" && request.method === "GET") {
    await ensureEditorTables(client);
    const [published, draft] = await Promise.all([loadPublished(client), loadDraft(client, user.id)]);
    sendJson(response, 200, { content: draft?.content || published.content, draft: Boolean(draft) });
    return;
  }

  if (pathname === "/api/editor/draft" && request.method === "PUT") {
    requireEditorRequest(request);
    enforceRateLimit(request, `draft:${user.id}`, { max: 60, windowMs: 5 * 60 * 1000 });
    await ensureEditorTables(client);
    const body = await readJson(request);
    const content = await validateEditorContent(client, body?.content);
    const published = await loadPublished(client);
    if (body?.revision !== published.revision) {
      throw new HttpError(409, "The live site changed since this draft was opened. Reload before saving a new draft.");
    }
    const result = await saveDraftAtomically(client, {
      content,
      publishedRevision: published.revision,
      user,
      expectedDraftRevision: optionalDraftRevision(body?.draftRevision),
      action: "draft_saved",
      summary: summarizeChange(content),
      metadata: { revision: published.revision },
    });
    sendJson(response, 200, {
      content,
      revision: published.revision,
      savedAt: result.updated_at,
      draft: true,
    });
    return;
  }

  if (pathname === "/api/editor/publish" && request.method === "POST") {
    requireEditorRequest(request);
    enforceRateLimit(request, `publish:${user.id}`, { max: 10, windowMs: 10 * 60 * 1000 });
    await ensureEditorTables(client);
    const body = await readJson(request);
    const published = await loadPublished(client);
    if (body?.revision !== published.revision) {
      throw new HttpError(409, "The live site changed since this editor loaded it. Reload before publishing.");
    }
    const expectedDraftRevision = optionalDraftRevision(body?.draftRevision);
    const draft = await loadDraft(client, user.id);
    if (!draft || !expectedDraftRevision) {
      throw new HttpError(409, "Save a draft before publishing.");
    }
    if (draft.updatedAt !== expectedDraftRevision || draft.baseRevision !== published.revision) {
      throw new HttpError(409, "This draft or the live site changed. Reload and review it before publishing.");
    }
    const content = await validateEditorContent(client, draft.content);
    const summary = summarizeChange(content);
    const { data, error } = await client.rpc("publish_telegram_content", {
      p_expected_revision: published.revision,
      p_editor_id: user.id,
      p_editor_name: user.name,
      p_summary: summary,
      p_expected_draft_revision: expectedDraftRevision,
    });
    if (error) {
      if (error.code === "P0001" || /changed while this publish was in progress|draft changed while/i.test(error.message || "")) {
        throw new HttpError(409, "The live site or this draft changed while publishing. Reload and review it again.");
      }
      throw tableSetupError(error);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.updated_at) throw new HttpError(502, "Publishing did not return a live-site revision.");

    sendJson(response, 200, {
      content: result.content,
      revision: result.updated_at,
      savedAt: result.updated_at,
      draft: false,
    });
    return;
  }

  if (pathname === "/api/editor/history" && request.method === "GET") {
    await ensureEditorTables(client);
    const requestedLimit = Number(new URL(request.url, "http://localhost").searchParams.get("limit"));
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, requestedLimit)) : 20;
    const { data, error } = await client
      .from("editor_content_versions")
      .select("id, editor_id, editor_name, summary, published_at, content")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw tableSetupError(error);
    sendJson(response, 200, { entries: data || [] });
    return;
  }

  const restoreMatch = /^\/api\/editor\/history\/([0-9a-f-]{36})\/restore$/i.exec(pathname);
  if (restoreMatch && request.method === "POST") {
    requireEditorRequest(request);
    enforceRateLimit(request, `restore:${user.id}`, { max: 20, windowMs: 10 * 60 * 1000 });
    await ensureEditorTables(client);
    const body = await readJson(request);
    const { data, error } = await client
      .from("editor_content_versions")
      .select("content, summary")
      .eq("id", restoreMatch[1])
      .maybeSingle();
    if (error) throw tableSetupError(error);
    if (!data) throw new HttpError(404, "That version is no longer available.");
    const content = await validateEditorContent(client, data.content);
    const published = await loadPublished(client);
    const result = await saveDraftAtomically(client, {
      content,
      publishedRevision: published.revision,
      user,
      expectedDraftRevision: optionalDraftRevision(body?.draftRevision),
      action: "version_restored_to_draft",
      summary: `Restored ${data.summary || "a previous version"} to draft`,
      metadata: { versionId: restoreMatch[1] },
    });
    sendJson(response, 200, { content, revision: published.revision, savedAt: result.updated_at, draft: true });
    return;
  }

  if (pathname === "/api/editor/assets" && request.method === "GET") {
    const source = new URL(request.url, "http://localhost").searchParams.get("source");
    const assets = source === "local" ? await listLocalAssets() : await listStorageAssets(client);
    sendJson(response, 200, { assets });
    return;
  }

  if (pathname === "/api/editor/assets" && request.method === "POST") {
    requireEditorRequest(request);
    enforceRateLimit(request, `upload:${user.id}`, { max: 20, windowMs: 10 * 60 * 1000 });
    await ensureEditorTables(client);
    const body = await readBody(request, MAX_UPLOAD_BYTES + 64 * 1024);
    const file = parseMultipartFile(body, request.headers["content-type"]);
    if (file.body.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "Media files must be 4MB or smaller.");
    const asset = await uploadAsset(client, file);
    await audit(client, user, "asset_uploaded", `Uploaded ${asset.path}`, { path: asset.path, size: asset.size });
    sendJson(response, 201, { asset });
    return;
  }

  throw new HttpError(405, "Method not allowed.");
}

/**
 * Handles every private Telegram/admin route. The public site never receives
 * a service-role key, Telegram bot token, or a route that writes without an
 * authenticated Telegram session.
 */
export async function handleTelegramEditorRequest(request, response, pathname) {
  const isSessionRoute = pathname === "/api/telegram/session";
  const isWebhookRoute = pathname === "/api/telegram/webhook";
  const isEditorRoute = pathname.startsWith("/api/editor/");
  if (!isSessionRoute && !isWebhookRoute && !isEditorRoute) return false;

  try {
    if (isWebhookRoute) {
      if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
      await handleWebhook(request, response);
      return true;
    }

    if (isSessionRoute) {
      if (request.method === "POST") {
        await createTelegramSession(request, response);
        return true;
      }
      if (request.method === "GET") {
        const user = requireEditorSession(request);
        sendJson(response, 200, { authorized: true, user: publicUser(user) });
        return true;
      }
      if (request.method === "DELETE") {
        requireEditorRequest(request);
        sendJson(response, 200, { ok: true }, { "Set-Cookie": expiredSessionCookie() });
        return true;
      }
      throw new HttpError(405, "Method not allowed.");
    }

    await handleEditorContent(request, response, pathname);
    return true;
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message =
      error instanceof HttpError ? error.message : "The secure editor could not complete that request.";
    sendJson(response, status, { authorized: false, message });
    return true;
  }
}
