import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  createEditorSession,
  parseAdminIds,
  requireAllowedTelegramUser,
  verifyEditorSession,
  verifyTelegramInitData,
} from "../server/telegram-auth.mjs";

const BOT_TOKEN = "000000:local-test-token-not-a-real-credential";
const NOW = 1_800_000_000_000;

function signedInitData(fields) {
  const values = new URLSearchParams(fields);
  const checkString = [...values.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  values.set("hash", createHmac("sha256", secret).update(checkString).digest("hex"));
  return values.toString();
}

test("verifies authentic Telegram WebApp launch data", () => {
  const initData = signedInitData({
    auth_date: String(Math.floor(NOW / 1000)),
    query_id: "AAH-demo",
    user: JSON.stringify({ id: 123456789, first_name: "MMONN", username: "mmonn" }),
  });

  assert.deepEqual(verifyTelegramInitData(initData, BOT_TOKEN, { now: NOW }), {
    id: "123456789",
    firstName: "MMONN",
    lastName: "",
    username: "mmonn",
    name: "MMONN",
  });
});

test("rejects tampered Telegram launch data", () => {
  const initData = signedInitData({
    auth_date: String(Math.floor(NOW / 1000)),
    user: JSON.stringify({ id: 123456789, first_name: "MMONN" }),
  }).replace("123456789", "123456788");

  assert.throws(() => verifyTelegramInitData(initData, BOT_TOKEN, { now: NOW }));
});

test("enforces a closed-by-default Telegram allowlist", () => {
  const user = { id: "123456789" };
  assert.throws(() => requireAllowedTelegramUser(user, parseAdminIds("")));
  assert.throws(() => requireAllowedTelegramUser(user, parseAdminIds("987654321")));
  assert.equal(requireAllowedTelegramUser(user, parseAdminIds("123456789, 987654321")), user);
});

test("signs and expires server-only editor sessions", () => {
  const secret = "a secure session secret with more than thirty two characters";
  const token = createEditorSession({ id: "123456789", name: "MMONN", username: "mmonn" }, secret, {
    now: NOW,
    ttlSeconds: 60,
  });

  assert.deepEqual(verifyEditorSession(token, secret, { now: NOW + 10_000 }), {
    id: "123456789",
    name: "MMONN",
    username: "mmonn",
  });
  assert.equal(verifyEditorSession(token, secret, { now: NOW + 61_000 }), null);
  assert.equal(verifyEditorSession(`${token}tampered`, secret, { now: NOW + 10_000 }), null);
});
