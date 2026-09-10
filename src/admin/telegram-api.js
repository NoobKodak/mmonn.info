/**
 * Browser adapter for the Telegram Mini App editor.
 *
 * This module intentionally has no Supabase import. Telegram initData is sent
 * once to the application's own server; all later reads and mutations use an
 * HttpOnly session cookie issued only after the server verifies Telegram's
 * HMAC signature and the configured allowlist.
 */

function errorFromResponse(response, payload) {
  const fallback =
    response.status === 404
      ? "The secure Telegram editor API is not deployed at this address. Deploy the Node server, then set Telegram's Web App URL to that same HTTPS address."
      : response.status === 401
        ? "Your private editor session has expired. Close and reopen the editor from Telegram, then try the upload again."
        : response.status === 403
          ? "This upload was not accepted by the secure editor. Reopen the editor from the authorized Telegram account and try again."
          : response.status === 400
            ? "The server could not accept this image. Use a JPEG, PNG, WebP, GIF, SVG, or AVIF file and try again."
            : response.status === 413
              ? "This photo is too large for the secure uploader. Choose an image below 4 MB, or use a JPEG, PNG, or WebP photo so it can be compressed automatically."
              : response.status >= 500
                ? "The secure Telegram editor server is not configured correctly. Check its server-only Telegram environment settings."
                : "The secure editor request failed.";
  const error = new Error(payload?.message || fallback);
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

// This sits below Vercel's request limit after multipart overhead. The server
// remains the authority and independently rejects anything larger.
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_UPLOAD_EDGE = 2400;

function replaceExtension(name, extension) {
  const stem = String(name || "photo").replace(/\.[^.]+$/, "") || "photo";
  return `${stem}${extension}`;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === "function") return createImageBitmap(file);

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("This image could not be prepared for upload."));
      element.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Keeps original files whenever possible. Large photos are converted in the
 * browser only when necessary, so a phone camera image can pass through a
 * serverless upload gateway without a separate image-processing service.
 */
async function optimizePhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return null;

  const source = await loadImageSource(file);
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const outputType = file.type === "image/png" ? "image/webp" : "image/jpeg";
  const extension = outputType === "image/webp" ? ".webp" : ".jpg";

  try {
    for (const edge of [MAX_UPLOAD_EDGE, 2000, 1600, 1280]) {
      const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d", { alpha: outputType === "image/webp" });
      if (!context) throw new Error("This browser cannot prepare the selected image.");
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.88, 0.76, 0.64]) {
        const blob = await canvasBlob(canvas, outputType, quality);
        if (!blob) continue;
        if (blob.size <= MAX_UPLOAD_BYTES) {
          return new File([blob], replaceExtension(file.name, extension), {
            type: outputType,
            lastModified: Date.now(),
          });
        }
      }
    }
  } finally {
    source.close?.();
  }

  return null;
}

async function prepareUpload(file) {
  if (!file || typeof file.size !== "number") throw new Error("Choose an image file to upload.");
  if (file.size === 0) throw new Error("The selected image is empty.");
  if (file.size <= MAX_UPLOAD_BYTES) return file;

  const optimized = await optimizePhoto(file);
  if (optimized) return optimized;

  throw new Error("This photo is too large. Use a JPEG, PNG, or WebP image under 4 MB; animated GIFs and SVGs cannot be compressed automatically.");
}

export async function uploadAsset(file) {
  const prepared = await prepareUpload(file);
  const form = new FormData();
  form.append("file", prepared, prepared.name);
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
