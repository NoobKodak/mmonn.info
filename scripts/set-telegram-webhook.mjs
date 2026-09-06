import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();

async function readEnvironmentFile(name) {
  try {
    const source = await readFile(join(root, name), "utf8");
    return Object.fromEntries(
      source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => line.replace(/^export\s+/, ""))
        .map((line) => {
          const separator = line.indexOf("=");
          if (separator < 1) return null;
          const key = line.slice(0, separator).trim();
          let value = line.slice(separator + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          return [key, value];
        })
        .filter(Boolean),
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

const local = {
  ...(await readEnvironmentFile(".env")),
  ...(await readEnvironmentFile(".env.local")),
};
for (const [key, value] of Object.entries(local)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const required = ["TELEGRAM_BOT_TOKEN", "PUBLIC_SITE_URL", "TELEGRAM_WEBHOOK_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Set ${missing.join(", ")} in private environment settings before configuring Telegram.`);
}

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const endpoint = `https://api.telegram.org/bot${botToken}`;
let publicUrl;
try {
  publicUrl = new URL(process.env.PUBLIC_SITE_URL);
  if (publicUrl.protocol !== "https:") throw new Error("not https");
} catch {
  throw new Error("PUBLIC_SITE_URL must be a valid HTTPS URL before configuring Telegram.");
}
const webhookUrl = new URL("/api/telegram/webhook", publicUrl).toString();

async function telegram(method, body) {
  let response;
  try {
    response = await fetch(`${endpoint}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Telegram ${method} could not be reached.`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.description || `Telegram ${method} failed.`);
  return payload.result;
}

await telegram("setMyCommands", {
  commands: [
    { command: "edit", description: "Open the secure MMONN editor" },
    { command: "status", description: "Check editor access" },
    { command: "help", description: "Show editor help" },
  ],
});
await telegram("setWebhook", {
  url: webhookUrl,
  secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message"],
  drop_pending_updates: false,
});

console.log("Telegram commands and webhook configured.");
