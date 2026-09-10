import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";

import { handleTelegramEditorRequest } from "../server/telegram-editor.mjs";
import { createEditorSession } from "../server/telegram-auth.mjs";

const content = JSON.parse(await readFile(new URL("../src/data/content.json", import.meta.url), "utf8"));
const revision = "2026-09-06T00:00:00.000Z";
const sessionSecret = "route test session secret that is safely longer than thirty two characters";
const botToken = "000000:route-test-token-not-real";

Object.assign(process.env, {
  TELEGRAM_BOT_TOKEN: botToken,
  TELEGRAM_ADMIN_IDS: "123456789",
  TELEGRAM_SESSION_SECRET: sessionSecret,
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "route-test-service-key-not-real",
  PUBLIC_SITE_URL: "http://localhost",
});

function signedInitData() {
  const values = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "route-test-query",
    user: JSON.stringify({ id: 123456789, first_name: "MMONN", username: "mmonn" }),
  });
  const checkString = [...values.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  values.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));
  return values.toString();
}

function makeRequest({ method, path, body, rawBody, contentType, userId = "123456789" }) {
  const payload = rawBody ?? (body ? Buffer.from(JSON.stringify(body)) : null);
  const stream = Readable.from(payload ? [payload] : []);
  const session = createEditorSession({ id: userId, name: "MMONN", username: "mmonn" }, sessionSecret);
  Object.assign(stream, {
    method,
    url: path,
    headers: {
      cookie: `mmonn_editor=${encodeURIComponent(session)}`,
      origin: "http://localhost",
      "x-mmonn-editor": "1",
      ...(contentType ? { "content-type": contentType } : body ? { "content-type": "application/json" } : {}),
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  return stream;
}

function makeResponse() {
  const response = { status: 0, headers: {}, body: "" };
  response.writeHead = (status, headers) => {
    response.status = status;
    response.headers = headers;
  };
  response.end = (body = "") => {
    response.body = String(body);
  };
  return response;
}

async function invoke(options) {
  const request = makeRequest(options);
  const response = makeResponse();
  await handleTelegramEditorRequest(request, response, new URL(options.path, "http://localhost").pathname);
  return { response, payload: JSON.parse(response.body) };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function multipartFile({ filename, type, body }) {
  const boundary = "----mmonn-editor-route-test";
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
        "utf8",
      ),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]),
  };
}

function editorFetch({ published = content, draft = null, rpcResult } = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const method = init.method || "GET";

    if (path.startsWith("/storage/v1/object/list/")) {
      // The bundled content references this existing uploaded collaboration
      // frame. Returning it here lets the route test exercise validation
      // instead of failing before the draft/publish write is reached.
      return json([{ id: "test-upload", name: "uploads/image-2026-09-03-192541971.png", metadata: { size: 1 } }]);
    }
    if (path.startsWith("/storage/v1/object/site-assets/uploads/") && method === "POST") return json({});
    if (path.endsWith("/editor_content_drafts") && method === "GET") {
      return json(url.searchParams.get("select") === "editor_id" ? [] : draft ? [draft] : []);
    }
    if (path.endsWith("/editor_content_versions") && method === "GET") return json([]);
    if (path.endsWith("/editor_audit") && method === "GET") return json([]);
    if (path.endsWith("/editor_audit") && method === "POST") return json([]);
    if (path.endsWith("/site_content") && method === "GET") {
      return json([{ content: published, updated_at: revision }]);
    }
    if (path.endsWith("/rpc/save_telegram_draft") && method === "POST") {
      return json([{ updated_at: "2026-09-06T00:01:00.000Z" }]);
    }
    if (path.endsWith("/rpc/publish_telegram_content") && method === "POST") {
      return json(rpcResult || [{ content: published, updated_at: "2026-09-06T00:02:00.000Z" }]);
    }
    throw new Error(`Unexpected Supabase request: ${method} ${url.pathname}${url.search}`);
  };
}

async function withFetch(mock, action) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await action();
  } finally {
    globalThis.fetch = original;
  }
}

test("server denies a valid session whose Telegram ID is not on the allowlist", { concurrency: false }, async () => {
  const { response, payload } = await invoke({ method: "GET", path: "/api/editor/content", userId: "999999999" });
  assert.equal(response.status, 403);
  assert.equal(payload.message, "You do not have editor access.");
});

test("server stays closed when more than one Telegram owner ID is configured", { concurrency: false }, async () => {
  const previous = process.env.TELEGRAM_ADMIN_IDS;
  process.env.TELEGRAM_ADMIN_IDS = "123456789,987654321";
  try {
    const { response, payload } = await invoke({ method: "GET", path: "/api/editor/content" });
    assert.equal(response.status, 503);
    assert.match(payload.message, /exactly one TELEGRAM_ADMIN_IDS/i);
  } finally {
    process.env.TELEGRAM_ADMIN_IDS = previous;
  }
});

test("HTTPS editor sessions receive a Secure HttpOnly cookie usable inside Telegram's embedded webview", { concurrency: false }, async () => {
  const previous = process.env.PUBLIC_SITE_URL;
  process.env.PUBLIC_SITE_URL = "https://artist.example.test";
  try {
    const { response, payload } = await invoke({
      method: "POST",
      path: "/api/telegram/session",
      body: { initData: signedInitData() },
    });
    assert.equal(response.status, 200, payload.message);
    assert.match(response.headers["Set-Cookie"], /HttpOnly/);
    // Telegram often loads the Mini App inside an iframe within its own
    // client, making requests back to this origin "cross-site" from the
    // cookie jar's perspective — SameSite=None (paired with Secure) is
    // required for the session cookie to survive that context.
    assert.match(response.headers["Set-Cookie"], /SameSite=None/);
    assert.match(response.headers["Set-Cookie"], /(?:^|; )Secure(?:;|$)/);
  } finally {
    process.env.PUBLIC_SITE_URL = previous;
  }
});

test("server saves a validated draft without publishing it", { concurrency: false }, async () => {
  const { response, payload } = await withFetch(editorFetch(), () =>
    invoke({ method: "PUT", path: "/api/editor/draft", body: { content, revision } }),
  );

  assert.equal(response.status, 200, payload.message);
  assert.equal(payload.draft, true);
  assert.equal(payload.revision, revision);
});

test("server publishes through the atomic version-and-audit RPC", { concurrency: false }, async () => {
  const draftUpdatedAt = "2026-09-06T00:01:00.000Z";
  const publishedAt = "2026-09-06T00:02:00.000Z";
  const savedDraft = {
    content,
    base_revision: revision,
    updated_at: draftUpdatedAt,
    editor_name: "MMONN",
  };
  const { response, payload } = await withFetch(
    editorFetch({ draft: savedDraft, rpcResult: [{ content, updated_at: publishedAt }] }),
    () => invoke({ method: "POST", path: "/api/editor/publish", body: { revision, draftRevision: draftUpdatedAt } }),
  );

  assert.equal(response.status, 200, payload.message);
  assert.equal(payload.draft, false);
  assert.equal(payload.revision, publishedAt);
  assert.notEqual(payload.revision, revision);
});

test("server requires a saved draft before publishing", { concurrency: false }, async () => {
  const { response, payload } = await withFetch(editorFetch(), () =>
    invoke({ method: "POST", path: "/api/editor/publish", body: { revision, draftRevision: null } }),
  );

  assert.equal(response.status, 409);
  assert.match(payload.message, /Save a draft before publishing/);
});

test("server rejects an unsafe YouTube embed before saving a draft", { concurrency: false }, async () => {
  const unsafe = structuredClone(content);
  unsafe.music.videos[0].embedUrl = "javascript:alert(1)";
  const { response, payload } = await withFetch(editorFetch(), () =>
    invoke({ method: "PUT", path: "/api/editor/draft", body: { content: unsafe, revision } }),
  );

  assert.equal(response.status, 400);
  assert.match(payload.message, /embedUrl must use https|official YouTube embed URL/);
});

test("server accepts a valid collaboration photo through the protected upload route", { concurrency: false }, async () => {
  const upload = multipartFile({
    filename: "collaboration-photo.png",
    type: "image/png",
    body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]),
  });
  const { response, payload } = await withFetch(editorFetch(), () =>
    invoke({ method: "POST", path: "/api/editor/assets", rawBody: upload.body, contentType: upload.contentType }),
  );

  assert.equal(response.status, 201, payload.message);
  assert.equal(payload.asset.path, "uploads/collaboration-photo.png");
  assert.equal(payload.asset.size, 10);
});
