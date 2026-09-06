import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const TELEGRAM_ID_PATTERN = /^\d{1,20}$/;

export class TelegramAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = "TelegramAuthError";
    this.status = status;
  }
}

/**
 * Telegram IDs are kept as strings. It avoids accidental precision loss for
 * a future ID larger than JavaScript's safe-integer range.
 */
export function parseAdminIds(value) {
  return new Set(
    String(value || "")
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter((id) => TELEGRAM_ID_PATTERN.test(id)),
  );
}

function safeHexEqual(first, second) {
  if (!HASH_PATTERN.test(first || "") || !HASH_PATTERN.test(second || "")) return false;
  const a = Buffer.from(first, "hex");
  const b = Buffer.from(second, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function cleanUser(rawUser) {
  let user;
  try {
    user = JSON.parse(rawUser);
  } catch {
    throw new TelegramAuthError("Telegram sent an invalid user payload.");
  }

  const id = String(user?.id || "");
  if (!TELEGRAM_ID_PATTERN.test(id)) {
    throw new TelegramAuthError("Telegram did not provide a valid user ID.");
  }

  const compact = (value, max = 80) => String(value || "").trim().slice(0, max);
  const firstName = compact(user.first_name);
  const lastName = compact(user.last_name);
  const username = compact(user.username, 64).replace(/^@/, "");
  const name = [firstName, lastName].filter(Boolean).join(" ") || username || `Telegram ${id}`;

  return { id, firstName, lastName, username, name };
}

/**
 * Implements Telegram's documented WebApp initData HMAC validation. The
 * returned user is trustworthy only when `valid` is true.
 */
export function verifyTelegramInitData(
  initData,
  botToken,
  { now = Date.now(), maxAgeSeconds = 5 * 60 } = {},
) {
  if (!initData || typeof initData !== "string") {
    throw new TelegramAuthError("Open the editor from the MMONN Telegram bot.");
  }
  if (!botToken || typeof botToken !== "string") {
    throw new TelegramAuthError("Telegram editor is not configured on this server.", 503);
  }

  const parameters = new URLSearchParams(initData);
  const suppliedHash = parameters.get("hash");
  const authDate = Number(parameters.get("auth_date"));
  const rawUser = parameters.get("user");

  if (!suppliedHash || !Number.isFinite(authDate) || !rawUser) {
    throw new TelegramAuthError("Telegram launch data is incomplete.");
  }

  const seen = new Set();
  const entries = [];
  for (const [key, value] of parameters.entries()) {
    if (key === "hash") continue;
    if (seen.has(key)) throw new TelegramAuthError("Telegram launch data is malformed.");
    seen.add(key);
    entries.push([key, value]);
  }

  const dataCheckString = entries
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!safeHexEqual(suppliedHash, expectedHash)) {
    throw new TelegramAuthError("Telegram launch data could not be verified.");
  }

  const nowSeconds = Math.floor(now / 1000);
  if (authDate > nowSeconds + 60 || nowSeconds - authDate > maxAgeSeconds) {
    throw new TelegramAuthError("This Telegram editor session has expired. Reopen it from the bot.");
  }

  return cleanUser(rawUser);
}

export function requireAllowedTelegramUser(user, adminIds) {
  if (!adminIds?.size || !adminIds.has(String(user?.id || ""))) {
    throw new TelegramAuthError("You do not have editor access.", 403);
  }
  return user;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function signSessionPart(payloadPart, sessionSecret) {
  return createHmac("sha256", sessionSecret).update(payloadPart).digest("base64url");
}

export function createEditorSession(user, sessionSecret, { now = Date.now(), ttlSeconds = 8 * 60 * 60 } = {}) {
  if (!sessionSecret || String(sessionSecret).length < 32) {
    throw new TelegramAuthError(
      "TELEGRAM_SESSION_SECRET must be at least 32 characters on the server.",
      503,
    );
  }

  const payload = {
    sub: String(user.id),
    name: String(user.name || "Telegram editor").slice(0, 100),
    username: String(user.username || "").slice(0, 64),
    exp: Math.floor(now / 1000) + ttlSeconds,
    nonce: randomBytes(16).toString("base64url"),
  };
  const body = encodeJson(payload);
  return `${body}.${signSessionPart(body, sessionSecret)}`;
}

export function verifyEditorSession(token, sessionSecret, { now = Date.now() } = {}) {
  if (!token || typeof token !== "string" || !sessionSecret) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || signature.length < 20) return null;

  const expected = signSessionPart(body, sessionSecret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = decodeJson(body);
  if (!payload || !TELEGRAM_ID_PATTERN.test(String(payload.sub || ""))) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;

  return {
    id: String(payload.sub),
    name: String(payload.name || "Telegram editor").slice(0, 100),
    username: String(payload.username || "").slice(0, 64),
  };
}
