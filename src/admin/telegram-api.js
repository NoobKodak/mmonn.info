/**
 * Browser adapter for the Telegram Mini App editor.
 *
 * This module intentionally has no Supabase import. Telegram initData is sent
 * once to the application's own server; all later reads and mutations use an
 * HttpOnly session cookie issued only after the server verifies Telegram's
 * HMAC signature and the configured allowlist.
 */

function errorFromResponse(response, payload) {
  const error = new Error(payload?.message || "The secure editor request failed.");
  error.status = response.status;
  return error;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  if (options.editorAction) headers.set("X-MMONN-Editor", "1");
  if (options.json) headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    body: options.json ? JSON.stringify(options.json) : options.body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw errorFromResponse(response, payload);
  return payload;
}

function telegramWebApp() {
  return window.Telegram?.WebApp || null;
}

function sessionShape(user) {
  return user ? { user } : null;
}

export async function getSession() {
  const webApp = telegramWebApp();
  if (!webApp?.initData) return null;

  webApp.ready?.();
  webApp.expand?.();

  try {
    const current = await request("/api/telegram/session");
    return current.authorized ? sessionShape(current.user) : null;
  } catch (error) {
    // An absent or expired cookie is expected on the first Telegram launch.
    if (error.status !== 401 && error.status !== 403) throw error;
  }

  const verified = await request("/api/telegram/session", {
    method: "POST",
    json: { initData: webApp.initData },
  });
  return verified.authorized ? sessionShape(verified.user) : null;
}

export async function endSession() {
  await request("/api/telegram/session", { method: "DELETE", editorAction: true });
}

export async function loadContent() {
  const payload = await request("/api/editor/content");
  const selected = payload.draft || payload.published;
  return {
    content: selected.content,
    revision: payload.published.revision,
    publishedAt: payload.published.publishedAt,
    draftUpdatedAt: payload.draft?.updatedAt || null,
    hasDraft: Boolean(payload.draft),
  };
}

export async function saveContent(content, revision, draftRevision) {
  return request("/api/editor/draft", {
    method: "PUT",
    editorAction: true,
    json: { content, revision, draftRevision },
  });
}

export async function publishContent(revision, draftRevision) {
  return request("/api/editor/publish", {
    method: "POST",
    editorAction: true,
    json: { revision, draftRevision },
  });
}

export async function restoreVersion(id, draftRevision) {
  return request(`/api/editor/history/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    editorAction: true,
    json: { draftRevision },
  });
}

export async function loadAssets() {
  const payload = await request("/api/editor/assets");
  return payload.assets || [];
}

export async function loadLocalAssets() {
  const payload = await request("/api/editor/assets?source=local");
  return payload.assets || [];
}

export async function uploadAsset(file) {
  const form = new FormData();
  form.append("file", file, file.name);
  const payload = await request("/api/editor/assets", {
    method: "POST",
    editorAction: true,
    body: form,
  });
  return { asset: payload.asset };
}

export async function loadRecentHistory(limit = 20) {
  const payload = await request(`/api/editor/history?limit=${encodeURIComponent(limit)}`);
  return payload.entries || [];
}

export function previewUrl() {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("admin-preview", "1");
  return url.toString();
}
