# MMONN Telegram editor

The private editor is a Telegram Mini App at `/admin.html`. It does not have
email/password sign-up, and it does not write to Supabase from the browser.
Every editor request is verified server-side against Telegram WebApp
`initData`, checked against `TELEGRAM_ADMIN_IDS`, and then performed with the
server-only Supabase service-role key.

## One-time secure setup

1. In **BotFather**, create or choose the MMONN bot. If a bot token was ever
   pasted into a chat, code, screenshot, or commit, revoke it in BotFather and
   generate a replacement before continuing.
2. Deploy this Node server to an HTTPS domain. Telegram Mini Apps and webhooks
   need public HTTPS; `127.0.0.1` is only for local interface work.

   A static-only host (including GitHub Pages) cannot run the secure editor.
   Use a host that runs Node or Docker. This repository includes a
   `Dockerfile`; configure the service to expose its assigned `PORT`, use the
   public site domain for both URLs below, and do not deploy `dist/` by itself.
3. Copy `.env.example` to your private `.env.local` or deployment secret
   settings. Never commit that file.
4. Find **your numeric Telegram user ID** (for example, message a trusted ID
   bot), then set exactly that one value:

   ```env
   TELEGRAM_ADMIN_IDS=YOUR_NUMERIC_TELEGRAM_ID
   ```

   Keep it to one ID. The server rejects an empty, malformed, or multi-user
   value, so only that account can open the editor. Usernames are not accepted
   because they can change.
5. Generate two different secrets. With Node installed, run:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Put one result in `TELEGRAM_SESSION_SECRET` and another in
   `TELEGRAM_WEBHOOK_SECRET`.
6. Set these production URLs (replace the example domain):

   ```env
   PUBLIC_SITE_URL=https://your-domain.example
   TELEGRAM_WEB_APP_URL=https://your-domain.example/admin.html
   ```

7. In Supabase SQL Editor, run
   [`supabase/telegram-admin.sql`](supabase/telegram-admin.sql). It creates
   draft/version/audit tables and revokes the former browser-admin write path.
   Its Storage rule revokes direct authenticated uploads for every bucket in
   this Supabase project; remove or narrow that final statement only if you
   knowingly operate another authenticated Storage upload flow.
8. Set the bot command menu and webhook after the deployment is live:

   ```powershell
   npm run telegram:webhook
   ```

   The command configures `/edit`, `/status`, and `/help`, and uses
   `TELEGRAM_WEBHOOK_SECRET` to authenticate webhook deliveries.

9. Before opening the Mini App, validate the server configuration without
   printing any secrets. Replace the value with your own numeric Telegram ID:

   ```powershell
   npm run telegram:check -- YOUR_NUMERIC_TELEGRAM_ID
   ```

   Every line must begin with `OK`. If the public site is hosted as static
   files only, deploy the Node server too: `/api/telegram/session` and the
   secure editor API must share the same HTTPS origin as `admin.html`.

## Use

From the allowed Telegram account, send the bot:

```text
/edit
```

Tap **Open editor**. Directly visiting `/admin.html` in a normal browser
shows an access-denied screen, by design.

- **Save draft** stores private work only.
- **Preview** opens the current draft through an authenticated preview route.
- **Publish** requires confirmation, updates the public site, creates a
  version record, and adds an audit entry.
- **Drafts & history** restores a prior version to a draft first; it cannot
  change the live site until you confirm Publish.

The editor supports the live content fields, images/SVGs/GIFs, performance
GIF ordering, streaming milestone figures, collaboration Spotify/YouTube
embeds, music-video embeds, roles, navigation, and contact details. Repeatable
items use accessible move-up/move-down controls instead of drag-only sorting.

## Environment variables

| Variable | Where it belongs | Purpose |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | server only | Verifies Mini App launches and sends bot replies. |
| `TELEGRAM_ADMIN_IDS` | server only | Exactly one numeric owner ID; all other accounts are denied. |
| `TELEGRAM_SESSION_SECRET` | server only | Signs short-lived HttpOnly editor sessions. |
| `TELEGRAM_WEBHOOK_SECRET` | server only | Validates Telegram webhook deliveries. |
| `SUPABASE_URL` | server only | Server URL for the editor API. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Performs authorised draft/publish/storage actions. |
| `PUBLIC_SITE_URL` | server only | Used for same-origin editor protections. |
| `TELEGRAM_WEB_APP_URL` | server only | URL opened by `/edit`. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | browser-safe | Public-site live content and uploaded-asset reads only. |

Never use a `VITE_` prefix for a bot token, session secret, webhook secret, or
Supabase service-role key.

## Local checks

```powershell
npm test
npm run build
```

The included tests cover Telegram HMAC validation, deny-by-default allowlists,
session signing/expiry, and tamper rejection. The built site still needs an
HTTPS deployment plus the environment and Supabase migration above before the
Telegram editor can be used.
