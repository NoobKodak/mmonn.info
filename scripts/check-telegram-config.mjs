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

const fileValues = {
  ...(await readEnvironmentFile(".env")),
  ...(await readEnvironmentFile(".env.local")),
};
const value = (key) => process.env[key] ?? fileValues[key] ?? "";
const expectedOwner = process.argv[2];
const results = [];

function check(label, valid, help) {
  results.push({ label, valid, help });
}

function isHttpsUrl(input) {
  try {
    return new URL(input).protocol === "https:";
  } catch {
    return false;
  }
}

const ownerIds = value("TELEGRAM_ADMIN_IDS").split(/[\s,]+/).filter(Boolean);
check("TELEGRAM_BOT_TOKEN", Boolean(value("TELEGRAM_BOT_TOKEN")), "Set the current BotFather token in server secrets.");
check("TELEGRAM_ADMIN_IDS", ownerIds.length === 1 && /^\d+$/.test(ownerIds[0] || ""), "Set exactly one numeric Telegram user ID.");
check(
  "expected owner",
  !expectedOwner || (ownerIds.length === 1 && ownerIds[0] === expectedOwner),
  "The configured owner ID does not match the ID supplied to this command.",
);
check(
  "TELEGRAM_SESSION_SECRET",
  value("TELEGRAM_SESSION_SECRET").length >= 32,
  "Set a random server-only value with at least 32 characters.",
);
check(
  "TELEGRAM_WEBHOOK_SECRET",
  value("TELEGRAM_WEBHOOK_SECRET").length >= 16,
  "Set a random server-only webhook secret.",
);
check("SUPABASE_URL", isHttpsUrl(value("SUPABASE_URL")), "Set the HTTPS Supabase project URL.");
check("SUPABASE_SERVICE_ROLE_KEY", Boolean(value("SUPABASE_SERVICE_ROLE_KEY")), "Set the service-role key only on the server.");
check("PUBLIC_SITE_URL", isHttpsUrl(value("PUBLIC_SITE_URL")), "Set the public HTTPS deployment URL.");
check("TELEGRAM_WEB_APP_URL", isHttpsUrl(value("TELEGRAM_WEB_APP_URL")), "Set the HTTPS /admin.html URL opened by Telegram.");

for (const result of results) {
  console.log(`${result.valid ? "OK" : "MISSING"}  ${result.label}`);
  if (!result.valid) console.log(`        ${result.help}`);
}

if (!expectedOwner) console.log("\nTip: pass your numeric Telegram ID to verify the allowlist, for example: npm run telegram:check -- YOUR_ID");
if (results.some((result) => !result.valid)) process.exitCode = 1;
