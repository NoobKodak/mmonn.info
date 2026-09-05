# Content editor

An admin panel for editing the site's words and pictures without touching
code. It runs entirely against Supabase — content, images and the editor
account all live there — so it works from any machine with an internet
connection, not only this one.

## First-time setup

1. Open the panel (see *Running it* below) and choose **First time here?
   Create an account**, using the email and password you want to sign in
   with.
2. Supabase emails a confirmation link to that address. Click it.
3. Come back and sign in.

Only one editor account is expected. Anyone who can sign in has full write
access to the site's content.

## Running it

The panel talks to Supabase directly from the browser, so it works wherever
the site is deployed:

**On the live site:** open `/admin.html` on the deployed domain — e.g.
`https://mmonninfo.vercel.app/admin.html`. No install, no local machine
needed.

**Locally, for development:**

```bash
npm run dev
```

and open **http://127.0.0.1:4173/admin.html**. The site itself is at
http://127.0.0.1:4173/.

The only things that stay local-only are **Build site** and the *bundled*
half of the image picker (see *Images* below) — both need this machine's own
Vite toolchain, so they quietly do nothing useful from a deployed copy. Every
other part of the panel — sign in, edit, save, upload — is identical on both.

## What it edits

Everything the panel changes lives in one row in Supabase — table
`site_content`, column `content` — read and written straight from the browser:

| Panel | Controls |
| --- | --- |
| Hero | The role line under the portrait |
| Navigation | The scattered links, their labels and order (numbers follow the order) |
| About | The bio paragraphs and image descriptions |
| Collaborations | The shared polaroid frame, plus each entry's track, artists, release note, photo and — optionally — its own frame |
| Streaming milestones | The slides themselves — add, remove or reorder them, each with its own layout, background, artwork and copy |
| Media coverage | Each outlet: name, copy, background image |
| Notable projects | The headline and each card |
| Contact | Instagram handle, email, location |

**The change is live immediately** — the public site holds an open connection
to the same table and updates the moment a save lands, with no reload and no
build step. Anyone with the site open sees the edit arrive in real time.

### What it deliberately does not edit

- **Layout-critical artwork** — the portrait, the title cards, the Spotify
  mark. Their intrinsic dimensions drive the layouts, so swapping one is a
  design change, not a copy edit. Their *descriptions* (alt text) are editable.

  The **polaroid frames are the exception** and can be replaced or uploaded,
  per entry or for all of them at once — see *Polaroid frames* below.
- **The Spotify catalogue** — that is synced from Spotify, not hand-written.
  Refresh it with `npm run sync:spotify`.

## Images

Every image field has two buttons:

- **Browse** lists every image the site already has — both the artwork it shipped with and anything uploaded since.
- **Upload** adds a new one, straight to Supabase Storage (bucket
  `site-assets`), and it appears in the picker immediately. Existing files are
  never overwritten — a clashing name gains a number.

Only image files are accepted (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`,
`.webp`, `.avif`), up to 12MB each.

### Milestone slides

The Streaming milestones rail is a list, so slides can be added, removed and
reordered. Each slide picks a **layout**:

| Layout | What it shows |
| --- | --- |
| `figures` | A background image, a title card, and numbers that count up |
| `mark` | A logo or wordmark beside a line of copy |
| `blend` | A background with the card blended over the footage |
| `artwork` | Release artwork beside a line of copy |

**Background tone** says whether the slide sits on black or white; the
pagination inverts to match. Backgrounds and artwork can be browsed, uploaded
or cleared like any other image.

### Polaroid frames

The Collaborations panel has one **shared frame** used by every polaroid, and
each entry can override it with a frame of its own — useful for giving a
release a different polaroid design.

Picking or uploading a frame reads its pixel size automatically. The three
**Opening** percentages say where the photo window sits inside that frame, so a
frame with different margins needs those nudged until the photo lands in the
window. Leave an entry's frame empty and it uses the shared one.

## Publishing to the static build

The panel writes straight to the live site — there is no separate "publish"
step for a normal content edit. **Build site** exists for a different reason:
this project can also be exported as a static `dist/` folder (for hosting
somewhere that isn't running this Node server at all). That export bakes in
whatever the content looked like at build time, so if you ever deploy that
way, rebuild after editing. It only works from this machine, since it runs the
project's own local build tool.

## Safety notes

- **Postgres Row Level Security is the actual gate**, not anything the panel
  itself checks: the `site_content` table and `site-assets` bucket accept
  reads from anyone (the site is public) but writes only from a signed-in
  account. Confirmed directly: an anonymous request to write either one is
  refused by the database itself, regardless of what calls it.
- The panel also validates the shape of what it's about to save — an image
  field must name a file that was actually chosen through Browse or Upload,
  numbers must be numbers, and so on — so a slip doesn't quietly save garbage.
- Each save states which version of the content it started from. If it
  changed in the meantime — another tab, or a direct edit to the database —
  the save is refused rather than quietly overwriting the newer copy. Press
  **Reload** and reapply the change.
- Every past version is kept in `site_content_history`, so a bad save is
  recoverable by hand if it's ever needed.
- The publishable API key embedded in the site is not a secret: it identifies
  the project, and RLS is what decides what it's allowed to do. Never give the
  *secret* Supabase key a `VITE_` prefix — that would ship it to every visitor.

## If something breaks

Every previous version of the content is in `site_content_history` — find the
one before the bad edit and copy its `content` value back into the `live` row.
