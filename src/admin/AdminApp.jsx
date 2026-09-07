import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publicAsset } from "../assets.js";
import bundledContent from "../data/content.json";
import NumberTicker from "../components/NumberTicker.jsx";
import {
  endSession,
  getSession,
  loadAssets,
  loadLocalAssets,
  loadContent,
  loadRecentHistory,
  previewUrl,
  publishContent,
  restoreVersion,
  saveContent,
  uploadAsset,
} from "./telegram-api.js";
import { ConfirmProvider, ToastProvider, useConfirm, useToast } from "./feedback.jsx";
import {
  IconChart,
  IconCheck,
  IconChevronDown,
  IconCompass,
  IconDashboard,
  IconExternal,
  IconHero,
  IconHistory,
  IconImage,
  IconInfo,
  IconLogOut,
  IconMail,
  IconMegaphone,
  IconMusic,
  IconRefresh,
  IconStar,
  IconUsers,
  IconX,
} from "./icons.jsx";
import {
  AssetField,
  ItemList,
  NumberField,
  SelectField,
  StringList,
  TextArea,
  TextField,
} from "./ui.jsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./components/ui/sheet.jsx";
import "./admin.css";

const PANELS = [
  { id: "dashboard", label: "Dashboard", icon: IconDashboard, group: "Overview" },
  { id: "history", label: "Drafts & history", icon: IconHistory, group: "Overview" },
  { id: "hero", label: "Hero", icon: IconHero, group: "Content" },
  { id: "navigation", label: "Navigation", icon: IconCompass, group: "Content" },
  { id: "about", label: "About", icon: IconInfo, group: "Content" },
  { id: "collaborations", label: "Collaborations", icon: IconUsers, group: "Content" },
  { id: "milestones", label: "Streaming milestones", icon: IconChart, group: "Content" },
  { id: "performances", label: "Performances", icon: IconImage, group: "Content" },
  { id: "media", label: "Media coverage", icon: IconMegaphone, group: "Content" },
  { id: "music", label: "Music", icon: IconMusic, group: "Content" },
  { id: "projects", label: "Notable projects", icon: IconStar, group: "Content" },
  { id: "contact", label: "Contact", icon: IconMail, group: "Content" },
];

const NAV_GROUPS = ["Overview", "Content"];

/** Every validation message starts with the top-level field it failed on
 *  (see src/admin/validate.js) — enough to point a save error at the panel
 *  that needs attention, with no extra plumbing between the two files. */
const FIELD_TO_PANEL = {
  hero: "hero",
  sections: "navigation",
  about: "about",
  polaroid: "collaborations",
  collaborations: "collaborations",
  milestones: "milestones",
  performances: "performances",
  media: "media",
  music: "music",
  projects: "projects",
  contact: "contact",
};

const ACCENTS = ["tape", "star", "pin"];
const SLIDE_KINDS = ["figures", "mark", "blend", "artwork"];
const TONES = ["dark", "light"];

const emptyImage = () => ({ src: "", width: 0, height: 0, alt: "" });

// A browser can safely inspect the Mini App layout during local development,
// but it must never become a route around Telegram authorization or the API.
function isLocalDesignPreview() {
  const hostname = window.location.hostname;
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  return isLoopback && (import.meta.env.DEV || new URLSearchParams(window.location.search).has("preview"));
}

/** Ids are anchors and React keys, so they are slugged and kept unique. */
function uniqueSlug(base, taken) {
  const root =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";

  if (!taken.includes(root)) return root;
  let n = 2;
  while (taken.includes(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export default function AdminApp() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AdminShell />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function AdminShell() {
  const toast = useToast();
  const confirm = useConfirm();
  const localPreview = useMemo(isLocalDesignPreview, []);
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [accessError, setAccessError] = useState("");
  const [content, setContent] = useState(null);
  const [saved, setSaved] = useState(null);
  const [assets, setAssets] = useState([]);
  const [history, setHistory] = useState([]);
  const [revision, setRevision] = useState(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [panel, setPanel] = useState(PANELS[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [busy, setBusy] = useState("loading");
  const [bootMessage, setBootMessage] = useState("Verifying your Telegram account…");
  const mainRef = useRef(null);

  useEffect(() => {
    if (localPreview) {
      setSession({ user: { id: "local-preview", name: "Local layout preview", username: "" } });
      return undefined;
    }

    let cancelled = false;
    getSession()
      .then((current) => {
        if (!cancelled) setSession(current);
      })
      .catch((error) => {
        if (cancelled) return;
        setAccessError(error.message || "The Telegram editor could not verify this account.");
        setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [localPreview]);

  const dirty = useMemo(
    () => Boolean(content && saved) && JSON.stringify(content) !== JSON.stringify(saved),
    [content, saved],
  );

  const refresh = useCallback(async ({ withAssets = false, announce = false } = {}) => {
    setBusy("loading");

    if (localPreview) {
      const previewContent = structuredClone(bundledContent);
      setContent(previewContent);
      setSaved(previewContent);
      setRevision("local-preview");
      setDraftUpdatedAt(null);
      setPublishedAt(null);
      if (withAssets) {
        setAssets([]);
        setHistory([]);
      }
      if (announce) toast.push({ tone: "info", message: "Reloaded the local design preview." });
      setBusy(null);
      return true;
    }

    try {
      const [contentPayload, uploadedAssets, localAssets, recent] = await Promise.all([
        loadContent(),
        withAssets ? loadAssets() : Promise.resolve(null),
        // Best-effort: this only works when a local `npm run dev` is serving
        // the panel, same as Build site. Signed in from elsewhere, the picker
        // still offers everything uploaded to Supabase — just not the
        // project's own bundled defaults.
        withAssets ? loadLocalAssets().catch(() => []) : Promise.resolve(null),
        withAssets ? loadRecentHistory().catch(() => []) : Promise.resolve(null),
      ]);
      setContent(contentPayload.content);
      setSaved(contentPayload.content);
      setRevision(contentPayload.revision);
      setDraftUpdatedAt(contentPayload.draftUpdatedAt);
      setPublishedAt(contentPayload.publishedAt);
      if (uploadedAssets) {
        setAssets([...localAssets, ...uploadedAssets].sort((a, b) => a.path.localeCompare(b.path)));
      }
      if (recent) setHistory(recent);
      if (announce) toast.push({ tone: "success", message: "Reloaded the live content." });
      return true;
    } catch (error) {
      setBootMessage(error.message);
      if (announce) toast.push({ tone: "error", message: error.message });
      return false;
    } finally {
      setBusy(null);
    }
  }, [localPreview, toast]);

  // The server only returns content after it validates this Telegram account.
  // Keeping the editor blank until then prevents an unauthorised flash.
  useEffect(() => {
    if (session) refresh({ withAssets: true });
  }, [session, refresh]);

  const save = useCallback(async () => {
    if (!content || busy) return;
    if (localPreview) {
      toast.push({ tone: "info", message: "Local preview is read-only. Open the Mini App from Telegram to save a draft." });
      return;
    }
    setBusy("saving");

    try {
      const result = await saveContent(content, revision, draftUpdatedAt);
      setSaved(result.content);
      setContent(result.content);
      setRevision(result.revision);
      setDraftUpdatedAt(result.savedAt);
      toast.push({
        tone: "success",
        message: "Draft saved. Preview it, then publish when you are ready.",
      });
    } catch (error) {
      const leadField = error.message.match(/^[a-zA-Z]+/)?.[0];
      const targetPanel = FIELD_TO_PANEL[leadField];
      toast.push({
        tone: "error",
        message: error.message,
        action:
          targetPanel && targetPanel !== panel
            ? {
                label: `Go to ${PANELS.find((p) => p.id === targetPanel)?.label}`,
                onClick: () => {
                  setPanel(targetPanel);
                  mainRef.current?.scrollTo({ top: 0 });
                },
              }
            : undefined,
      });
    } finally {
      setBusy(null);
    }
  }, [busy, content, revision, draftUpdatedAt, localPreview, panel, toast]);

  // Ctrl/Cmd+S is what anyone editing text will reach for.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const publish = async () => {
    if (busy) return;
    if (localPreview) {
      toast.push({ tone: "info", message: "Local preview is read-only. Publishing is only available from Telegram." });
      return;
    }
    const ok = await confirm({
      title: "Publish this draft?",
      message: "This will replace the live MMONN site content. A version will be saved first, so you can restore it later.",
      confirmLabel: "Publish now",
      tone: "default",
    });
    if (!ok) return;

    setBusy("publishing");
    try {
      const result = await publishContent(revision, draftUpdatedAt);
      setContent(result.content);
      setSaved(result.content);
      setRevision(result.revision);
      setPublishedAt(result.savedAt);
      setDraftUpdatedAt(null);
      setHistory((current) => [
        {
          id: `live-${result.revision}`,
          editor_name: session.user.name,
          summary: "Published current draft",
          published_at: result.savedAt,
          content: result.content,
        },
        ...current,
      ]);
      toast.push({ tone: "success", message: "Published. The live site is now updated." });
    } catch (error) {
      toast.push({ tone: "error", message: error.message });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (entry) => {
    if (busy) return;
    if (localPreview) {
      toast.push({ tone: "info", message: "Local preview is read-only. Restore a version from the Telegram Mini App." });
      return;
    }
    const ok = await confirm({
      title: "Restore this version to a draft?",
      message: "The live site will not change until you review and publish this restored draft.",
      confirmLabel: "Restore draft",
      tone: "default",
    });
    if (!ok) return;

    setBusy("restoring");
    try {
      const result = await restoreVersion(entry.id, draftUpdatedAt);
      setContent(result.content);
      setSaved(result.content);
      setRevision(result.revision);
      setDraftUpdatedAt(result.savedAt);
      setPanel("dashboard");
      mainRef.current?.scrollTo({ top: 0 });
      toast.push({ tone: "success", message: "Version restored to a draft. Review it before publishing." });
    } catch (error) {
      toast.push({ tone: "error", message: error.message });
    } finally {
      setBusy(null);
    }
  };

  const lockEditor = async () => {
    try {
      await endSession();
    } catch {
      // The local session is removed even if the browser went offline during
      // the request; reopening always requires a fresh verified launch.
    }
    setSession(null);
  };

  const patch = (key) => (value) => setContent((current) => ({ ...current, [key]: value }));

  /** Uploads land in Supabase Storage and join the picker straight away, so a
   *  newly added file can be chosen without reloading the editor. */
  const handleUpload = async (file) => {
    if (localPreview) {
      toast.push({ tone: "info", message: "Uploads are disabled in the local design preview." });
      return "";
    }
    const { asset } = await uploadAsset(file);
    setAssets((current) =>
      [...current.filter((entry) => entry.path !== asset.path), asset].sort((a, b) =>
        a.path.localeCompare(b.path),
      ),
    );
    toast.push({ tone: "success", message: `Uploaded ${asset.path}` });
    return asset.path;
  };

  /**
   * Reads a file's real pixel size straight from the browser rather than
   * making anyone open it to look it up. Those numbers only reserve the right
   * aspect ratio while the image loads, so if a file will not report a size
   * the previous values simply stand.
   */
  const withMeasuredSize = (src, apply) => {
    apply({ src });
    if (!src) return;

    const probe = (attempt) => {
      const image = new Image();
      image.onload = () => {
        const { naturalWidth: width, naturalHeight: height } = image;
        if (width && height) apply({ src, width, height });
      };
      image.onerror = () => {
        if (attempt < 2) window.setTimeout(() => probe(attempt + 1), 700);
      };
      image.src = `${publicAsset(src)}?m=${attempt}`;
    };

    probe(1);
  };

  const choosePolaroid = (src) =>
    withMeasuredSize(src, (patchFrame) =>
      setContent((current) =>
        patchFrame.width && current.polaroid.src !== src
          ? current
          : { ...current, polaroid: { ...current.polaroid, ...patchFrame } },
      ),
    );

  const chooseSlideImage = (index, slot, src) =>
    withMeasuredSize(src, (patchImage) =>
      setContent((current) => {
        const slide = current.milestones.slides[index];
        if (!slide || (patchImage.width && slide[slot].src !== src)) return current;

        const slides = [...current.milestones.slides];
        slides[index] = { ...slide, [slot]: { ...slide[slot], ...patchImage } };
        return { ...current, milestones: { ...current.milestones, slides } };
      }),
    );

  const chooseEntryFrame = (index, src) =>
    withMeasuredSize(src, (patchFrame) =>
      setContent((current) => {
        const entry = current.collaborations[index];
        if (!entry || (patchFrame.width && entry.frame.src !== src)) return current;

        const collaborations = [...current.collaborations];
        collaborations[index] = { ...entry, frame: { ...entry.frame, ...patchFrame } };
        return { ...current, collaborations };
      }),
    );

  const goTo = (id) => {
    setPanel(id);
    setMobileNavOpen(false);
    mainRef.current?.scrollTo({ top: 0 });
  };

  // Telegram's own Main Button is the primary action inside the Mini App —
  // it stays docked below the viewport (and above the keyboard) instead of
  // scrolling away with the page, so it mirrors whichever action the header
  // button would trigger next.
  useEffect(() => {
    const mainButton = window.Telegram?.WebApp?.MainButton;
    if (!mainButton) return undefined;

    if (!session || !content) {
      mainButton.hide();
      return undefined;
    }

    const readyToPublish = Boolean(draftUpdatedAt) && !dirty;
    const isBusy = busy === "saving" || busy === "publishing" || busy === "restoring";
    const handler = readyToPublish ? publish : save;

    mainButton.setText(readyToPublish ? "PUBLISH CHANGES" : "SAVE DRAFT");
    mainButton.show();
    mainButton.onClick(handler);

    if (isBusy) {
      mainButton.showProgress(false);
      mainButton.disable();
    } else {
      mainButton.hideProgress();
      if (readyToPublish || dirty) mainButton.enable();
      else mainButton.disable();
    }

    return () => mainButton.offClick(handler);
  }, [session, content, dirty, draftUpdatedAt, busy, save, publish]);

  if (session === undefined) {
    return <BootScreen message="Verifying your Telegram account…" />;
  }

  if (!session) {
    return <TelegramAccessScreen error={accessError} />;
  }

  if (!content) {
    return (
      <BootScreen
        message={bootMessage}
        error={bootMessage !== "Verifying your Telegram account…"}
        hint={
          <>
            Check the secure-editor setup and make sure <code>site_content</code> has a row with id <code>live</code>.
          </>
        }
        action={{ label: "Try again", onClick: () => refresh({ withAssets: true }) }}
      />
    );
  }

  const saveState = busy === "saving" || busy === "publishing" || busy === "restoring" ? "saving" : dirty ? "dirty" : "saved";
  const currentPanel = PANELS.find((entry) => entry.id === panel) ?? PANELS[0];

  return (
    <div className="ad">
      <header className="ad-top">
        <div className="ad-brand">
          <span className="ad-brand-mark" aria-hidden="true">
            M
          </span>
          <div className="ad-brand-text">
            <h1>MMONN Studio</h1>
            <span className="ad-brand-sub">Telegram Mini App · {currentPanel.label}</span>
          </div>
        </div>

        {localPreview && <span className="ad-local-preview">Local layout preview · read only</span>}

        <div className="ad-actions">
          <span className={`ad-state ad-state--${saveState}`} role="status">
            <span className="ad-state-dot" aria-hidden="true" />
            {localPreview
              ? "Preview only"
              : saveState === "saving"
              ? busy === "publishing"
                ? "Publishing…"
                : busy === "restoring"
                  ? "Restoring…"
                  : "Saving draft…"
              : saveState === "dirty"
                ? "Unsaved changes"
                : draftUpdatedAt
                  ? "Draft saved"
                  : "Published"}
          </span>

          <span className="ad-account" title={session.user.username ? `@${session.user.username}` : session.user.id}>
            {session.user.name}
          </span>

          <a className="ad-button ad-button--quiet ad-button--icon-collapse" href={previewUrl()} target="_blank" rel="noreferrer">
            <IconExternal /> <span className="ad-button-label">Preview</span>
          </a>

          <button
            className="ad-button ad-button--quiet ad-button--icon-collapse"
            type="button"
            onClick={() => refresh({ withAssets: true, announce: true })}
            disabled={Boolean(busy)}
            title="Discard what is on screen and read the live content again"
          >
            <IconRefresh /> <span className="ad-button-label">{busy === "loading" ? "Reloading…" : "Reload"}</span>
          </button>

          {!localPreview && (
            <button
              className="ad-button ad-button--quiet ad-button--icon-collapse"
              type="button"
              onClick={lockEditor}
            >
              <IconLogOut /> <span className="ad-button-label">Lock</span>
            </button>
          )}

          <button className="ad-button" type="button" onClick={save} disabled={localPreview || !dirty || Boolean(busy)}>
            {localPreview ? "Read only" : busy === "saving" ? "Saving…" : "Save draft"}
          </button>

          <button
            className="ad-button ad-button--publish"
            type="button"
            onClick={publish}
            disabled={localPreview || Boolean(busy) || !draftUpdatedAt || dirty}
            title={localPreview ? "Publishing is disabled in the local preview" : !draftUpdatedAt || dirty ? "Save the current changes as a draft before publishing" : undefined}
          >
            {busy === "publishing" ? "Publishing…" : "Publish"}
          </button>
        </div>

        <button
          className="ad-mobile-section-trigger"
          type="button"
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-section-sheet"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span className="ad-mobile-section-kicker">Editing</span>
          <strong>{currentPanel.label}</strong>
          <IconChevronDown />
        </button>
      </header>

      <div className="ad-body">
        <button
          className={`ad-mobile-scrim${mobileNavOpen ? " is-visible" : ""}`}
          type="button"
          aria-label="Close section picker"
          tabIndex={mobileNavOpen ? 0 : -1}
          onClick={() => setMobileNavOpen(false)}
        />

        <nav
          className={`ad-nav${mobileNavOpen ? " is-mobile-open" : ""}`}
          aria-label="Content sections"
        >
          <div className="ad-mobile-nav-head">
            <div>
              <span>MMONN Studio</span>
              <strong>Choose a section</strong>
            </div>
            <button className="ad-icon-button" type="button" aria-label="Close section picker" onClick={() => setMobileNavOpen(false)}>
              <IconX />
            </button>
          </div>
          {NAV_GROUPS.map((group) => (
            <div className="ad-nav-group" key={group}>
              <p className="ad-nav-group-label">{group}</p>
              <ul>
                {PANELS.filter((entry) => entry.group === group).map((entry) => (
                  <li key={entry.id}>
                    <button
                      className={`ad-nav-button${panel === entry.id ? " is-active" : ""}`}
                      type="button"
                      aria-current={panel === entry.id ? "true" : undefined}
                      onClick={() => goTo(entry.id)}
                    >
                      <entry.icon />
                      {entry.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <main className="ad-main" ref={mainRef}>
          {panel === "dashboard" && (
            <Dashboard
              content={content}
              draftUpdatedAt={draftUpdatedAt}
              history={history}
              publishedAt={publishedAt}
              session={session}
              onNavigate={goTo}
            />
          )}

          {panel === "history" && <HistoryPanel history={history} onRestore={restore} />}

          {panel === "hero" && (
            <Panel title="Hero" note="The role line under the portrait on the landing screen.">
              <StringList
                label="Roles"
                hint="Shown separated by stars. Four fit on one line at desktop width."
                itemLabel="role"
                addLabel="Add role"
                items={content.hero.roles}
                onChange={(roles) => patch("hero")({ ...content.hero, roles })}
              />
            </Panel>
          )}

          {panel === "navigation" && (
            <Panel
              title="Navigation"
              note="The scattered links revealed by Explore More. Numbers follow the order below, and the anchor must match the section it points at."
            >
              <ItemList
                label="Sections"
                items={content.sections}
                onChange={patch("sections")}
                itemLabel="section"
                min={1}
                title={(item) => item.label || item.id}
                makeItem={(items) => ({
                  id: uniqueSlug("section", items.map((entry) => entry.id)),
                  label: "new section",
                })}
                addLabel="Add section"
              >
                {(item, update) => (
                  <>
                    <TextField
                      label="Label"
                      hint="Displayed in lowercase"
                      value={item.label}
                      onChange={(label) => update({ label })}
                    />
                    <TextField
                      label="Anchor"
                      hint="Must match a section id on the page"
                      value={item.id}
                      onChange={(id) => update({ id })}
                    />
                  </>
                )}
              </ItemList>
              <p className="ad-note">
                Adding an entry here only adds a link. A new section also needs a component on the
                page, otherwise the link scrolls nowhere.
              </p>
            </Panel>
          )}

          {panel === "about" && (
            <Panel title="About" note="The bio and its image descriptions.">
              <StringList
                label="Paragraphs"
                items={content.about.paragraphs}
                onChange={(paragraphs) => patch("about")({ ...content.about, paragraphs })}
                multiline
                itemLabel="paragraph"
                addLabel="Add paragraph"
              />
              <TextField
                label="Heading image description"
                hint="Alt text for the “about the artist” lettering"
                value={content.about.headingAlt}
                onChange={(headingAlt) => patch("about")({ ...content.about, headingAlt })}
              />
              <TextField
                label="Portrait description"
                hint="Alt text read aloud in place of the photo"
                value={content.about.portraitAlt}
                onChange={(portraitAlt) => patch("about")({ ...content.about, portraitAlt })}
              />
            </Panel>
          )}

          {panel === "collaborations" && (
            <Panel
              title="Major collaborations"
              note="Each entry is one polaroid, and the dialog that opens when it is clicked."
            >
              <Group title="Polaroid frame">
                <AssetField
                  label="Frame image"
                  hint="Used for every polaroid. Picking a file reads its size automatically."
                  value={content.polaroid.src}
                  assets={assets}
                  allowEmpty={false}
                  onChange={choosePolaroid}
                  onUpload={handleUpload}
                />
                <div className="ad-grid">
                  <NumberField
                    label="Frame width"
                    hint="px"
                    value={content.polaroid.width}
                    min={1}
                    onChange={(width) => patch("polaroid")({ ...content.polaroid, width })}
                  />
                  <NumberField
                    label="Frame height"
                    hint="px"
                    value={content.polaroid.height}
                    min={1}
                    onChange={(height) => patch("polaroid")({ ...content.polaroid, height })}
                  />
                </div>

                <p className="ad-note">
                  The photo opening, as a percentage inset from each edge of the frame. A different
                  frame has different margins, so nudge these until the photo sits inside the
                  window.
                </p>
                <div className="ad-grid">
                  {[
                    ["top", "Opening — top"],
                    ["side", "Opening — sides"],
                    ["bottom", "Opening — bottom"],
                  ].map(([edge, label]) => (
                    <NumberField
                      key={edge}
                      label={label}
                      hint="%"
                      value={content.polaroid.window[edge]}
                      min={0}
                      max={49}
                      onChange={(value) =>
                        patch("polaroid")({
                          ...content.polaroid,
                          window: { ...content.polaroid.window, [edge]: value },
                        })
                      }
                    />
                  ))}
                </div>
              </Group>

              <ItemList
                label="Releases"
                items={content.collaborations}
                onChange={patch("collaborations")}
                itemLabel="collaboration"
                title={(item) => item.track || item.id}
                thumbnail={(item) => item.photo || item.frame?.src || content.polaroid.src}
                makeItem={(items) => ({
                  id: uniqueSlug("release", items.map((entry) => entry.id)),
                  track: "New release",
                  artists: ["MMONN"],
                  description: "",
                  photo: "",
                  media: { spotifyEmbedUrl: "", youtubeEmbedUrl: "", youtubeLabel: "" },
                  // Empty src means this entry uses the shared frame.
                  frame: { src: "", width: 0, height: 0, window: { top: 6, side: 6, bottom: 18 } },
                })}
                addLabel="Add collaboration"
              >
                {(item, update, index) => (
                  <>
                    <TextField
                      label="Track"
                      value={item.track}
                      onChange={(track) => update({ track })}
                    />
                    <StringList
                      label="Artists"
                      items={item.artists}
                      onChange={(artists) => update({ artists })}
                      itemLabel="artist"
                      addLabel="Add artist"
                    />
                    <TextArea
                      label="Release note"
                      hint="Shown in the dialog"
                      value={item.description}
                      onChange={(description) => update({ description })}
                    />
                    <Group title="Embedded listening">
                      <TextField
                        label="Spotify embed URL"
                        hint="Use an https://open.spotify.com/embed/... URL. Leave empty to show the MMONN artist player."
                        value={item.media?.spotifyEmbedUrl || ""}
                        onChange={(spotifyEmbedUrl) =>
                          update({ media: { ...item.media, spotifyEmbedUrl } })
                        }
                      />
                      <TextField
                        label="YouTube embed URL"
                        hint="Use an https://www.youtube.com/embed/... URL. Leave empty when there is no official video."
                        value={item.media?.youtubeEmbedUrl || ""}
                        onChange={(youtubeEmbedUrl) =>
                          update({ media: { ...item.media, youtubeEmbedUrl } })
                        }
                      />
                      <TextField
                        label="YouTube player title"
                        hint="Used by screen readers. Required when a YouTube URL is set."
                        value={item.media?.youtubeLabel || ""}
                        onChange={(youtubeLabel) => update({ media: { ...item.media, youtubeLabel } })}
                      />
                    </Group>
                    <AssetField
                      label="Photo"
                      hint="Optional. Fills the polaroid window; leave empty for a bare frame."
                      value={item.photo}
                      assets={assets}
                      onUpload={handleUpload}
                      onChange={(photo) => update({ photo })}
                    />
                    <AssetField
                      label="Frame for this entry"
                      hint="Optional. Leave empty to use the shared polaroid above."
                      value={item.frame.src}
                      assets={assets}
                      onUpload={handleUpload}
                      onChange={(src) => chooseEntryFrame(index, src)}
                    />

                    {item.frame.src && (
                      <div className="ad-grid">
                        {[
                          ["top", "Opening — top"],
                          ["side", "Opening — sides"],
                          ["bottom", "Opening — bottom"],
                        ].map(([edge, edgeLabel]) => (
                          <NumberField
                            key={edge}
                            label={edgeLabel}
                            hint="%"
                            value={item.frame.window[edge]}
                            min={0}
                            max={49}
                            onChange={(value) =>
                              update({
                                frame: {
                                  ...item.frame,
                                  window: { ...item.frame.window, [edge]: value },
                                },
                              })
                            }
                          />
                        ))}
                      </div>
                    )}

                    <TextField
                      label="Id"
                      hint="Used as the entry key"
                      value={item.id}
                      onChange={(id) => update({ id })}
                    />
                  </>
                )}
              </ItemList>
            </Panel>
          )}

          {panel === "milestones" && (
            <Panel
              title="Streaming milestones"
              note="A horizontal rail. Add, remove or reorder slides; each one picks a layout and brings its own artwork."
            >
              <TextField
                label="Section label"
                value={content.milestones.label}
                onChange={(label) => patch("milestones")({ ...content.milestones, label })}
              />

              <ItemList
                label="Slides"
                hint="Layout — figures: backdrop, title card and counting numbers · mark: a logo beside a line of copy · blend: backdrop with the card blended over it · artwork: release art beside a line of copy."
                items={content.milestones.slides}
                onChange={(slides) => patch("milestones")({ ...content.milestones, slides })}
                itemLabel="slide"
                min={1}
                title={(item) => item.title || item.id}
                thumbnail={(item) => item.art?.src || item.backdrop?.src}
                makeItem={(items) => ({
                  id: uniqueSlug("slide", items.map((entry) => entry.id)),
                  kind: "mark",
                  tone: "dark",
                  title: "New slide",
                  backdrop: emptyImage(),
                  art: emptyImage(),
                  copy: "",
                  figures: [],
                })}
                addLabel="Add slide"
              >
                {(item, update, index) => (
                  <>
                    <TextField
                      label="Slide name"
                      hint="Announced to screen readers; not shown on the slide"
                      value={item.title}
                      onChange={(title) => update({ title })}
                    />

                    <div className="ad-grid">
                      <SelectField
                        label="Layout"
                        value={item.kind}
                        options={SLIDE_KINDS}
                        onChange={(kind) => update({ kind })}
                      />
                      <SelectField
                        label="Background tone"
                        hint="light puts the slide on white"
                        value={item.tone}
                        options={TONES}
                        onChange={(tone) => update({ tone })}
                      />
                    </div>

                    <AssetField
                      label="Background image"
                      hint="Optional — fills the slide. Used by the figures and blend layouts."
                      value={item.backdrop.src}
                      assets={assets}
                      onUpload={handleUpload}
                      onChange={(src) => chooseSlideImage(index, "backdrop", src)}
                    />
                    {item.backdrop.src && (
                      <TextField
                        label="Background description"
                        value={item.backdrop.alt}
                        onChange={(alt) => update({ backdrop: { ...item.backdrop, alt } })}
                      />
                    )}

                    <AssetField
                      label={item.kind === "mark" ? "Logo" : "Artwork"}
                      hint="The title card, logo or release art for this slide."
                      value={item.art.src}
                      assets={assets}
                      onUpload={handleUpload}
                      onChange={(src) => chooseSlideImage(index, "art", src)}
                    />
                    {item.art.src && (
                      <TextField
                        label="Artwork description"
                        value={item.art.alt}
                        onChange={(alt) => update({ art: { ...item.art, alt } })}
                      />
                    )}

                    {item.kind !== "figures" && (
                      <TextArea
                        label="Copy"
                        hint="The line of type set beside or beneath the artwork"
                        rows={2}
                        value={item.copy}
                        onChange={(copy) => update({ copy })}
                      />
                    )}

                    {item.kind === "figures" && (
                      <ItemList
                        label="Counting figures"
                        hint="Each one counts up when the slide comes into view."
                        items={item.figures}
                        onChange={(figures) => update({ figures })}
                        itemLabel="figure"
                        title={(figure) => `${figure.value}${figure.suffix} · ${figure.metric}`}
                        makeItem={(figures) => ({
                          id: uniqueSlug("figure", figures.map((entry) => entry.id)),
                          value: 0,
                          suffix: "K+",
                          track: "",
                          metric: "",
                        })}
                        addLabel="Add figure"
                      >
                        {(figure, updateFigure) => (
                          <>
                            <div className="ad-grid">
                              <NumberField
                                label="Value"
                                hint="digits only"
                                value={figure.value}
                                min={0}
                                onChange={(value) => updateFigure({ value })}
                              />
                              <TextField
                                label="Suffix"
                                hint="e.g. K+ or M+"
                                value={figure.suffix}
                                onChange={(suffix) => updateFigure({ suffix })}
                              />
                            </div>
                            <TextField
                              label="Track"
                              value={figure.track}
                              onChange={(track) => updateFigure({ track })}
                            />
                            <TextField
                              label="Metric"
                              value={figure.metric}
                              onChange={(metric) => updateFigure({ metric })}
                            />
                          </>
                        )}
                      </ItemList>
                    )}

                    <TextField label="Id" value={item.id} onChange={(id) => update({ id })} />
                  </>
                )}
              </ItemList>
            </Panel>
          )}

          {panel === "performances" && (
            <Panel
              title="Performances"
              note="Manage the full-bleed GIF rail. The order here is the horizontal viewing order on the public page."
            >
              <TextField
                label="Section label"
                value={content.performances.label}
                onChange={(label) => patch("performances")({ ...content.performances, label })}
              />
              <ItemList
                label="Performance GIFs"
                hint="Each slide fills the viewport. Use move controls to set the left-to-right pagination order."
                items={content.performances.slides}
                onChange={(slides) => patch("performances")({ ...content.performances, slides })}
                itemLabel="GIF"
                min={1}
                title={(item) => item.alt || item.id}
                thumbnail={(item) => item.src}
                makeItem={(items) => ({
                  id: uniqueSlug("performance", items.map((entry) => entry.id)),
                  src: "",
                  alt: "New performance visual",
                })}
                addLabel="Add performance GIF"
              >
                {(item, update) => (
                  <>
                    <AssetField
                      label="GIF or image"
                      hint="Upload or choose a GIF. It will be covered full-screen with the page's black edge treatment."
                      value={item.src}
                      assets={assets}
                      allowEmpty={false}
                      onUpload={handleUpload}
                      onChange={(src) => update({ src })}
                    />
                    <TextField
                      label="Description"
                      hint="Accessible description for this performance visual."
                      value={item.alt}
                      onChange={(alt) => update({ alt })}
                    />
                    <TextField label="Id" value={item.id} onChange={(id) => update({ id })} />
                  </>
                )}
              </ItemList>
            </Panel>
          )}

          {panel === "media" && (
            <Panel
              title="Media coverage"
              note="One slide per outlet, in the order they appear on the rail."
            >
              <ItemList
                label="Outlets"
                items={content.media}
                onChange={patch("media")}
                itemLabel="outlet"
                title={(item) => item.outlet || item.id}
                thumbnail={(item) => item.background?.src}
                makeItem={(items) => ({
                  id: uniqueSlug("outlet", items.map((entry) => entry.id)),
                  outlet: "New outlet",
                  copy: "",
                  background: { src: "", alt: "" },
                })}
                addLabel="Add outlet"
              >
                {(item, update) => (
                  <>
                    <TextField
                      label="Outlet"
                      value={item.outlet}
                      onChange={(outlet) => update({ outlet })}
                    />
                    <TextArea
                      label="Copy"
                      value={item.copy}
                      onChange={(copy) => update({ copy })}
                    />
                    <AssetField
                      label="Background"
                      hint="Fills the slide. GIFs and photographs both work."
                      value={item.background.src}
                      assets={assets}
                      allowEmpty={false}
                      onUpload={handleUpload}
                      onChange={(src) => update({ background: { ...item.background, src } })}
                    />
                    <TextField
                      label="Background description"
                      value={item.background.alt}
                      onChange={(alt) => update({ background: { ...item.background, alt } })}
                    />
                    <TextField label="Id" value={item.id} onChange={(id) => update({ id })} />
                  </>
                )}
              </ItemList>
            </Panel>
          )}

          {panel === "music" && (
            <Panel
              title="Music"
              note="Audience figures appear at the top-right of the music section. Music-video embeds appear above the Spotify catalog."
            >
              <Group title="Audience figures">
                <TextField
                  label="Accessible label"
                  value={content.musicMetrics.label}
                  onChange={(label) => patch("musicMetrics")({ ...content.musicMetrics, label })}
                />
                <ItemList
                  label="Figures"
                  items={content.musicMetrics.items}
                  onChange={(items) => patch("musicMetrics")({ ...content.musicMetrics, items })}
                  itemLabel="figure"
                  title={(item) => `${item.label}: ${item.value}`}
                  makeItem={(items) => ({
                    id: uniqueSlug("metric", items.map((entry) => entry.id)),
                    label: "Metric",
                    value: "0",
                  })}
                  addLabel="Add figure"
                >
                  {(item, update) => (
                    <>
                      <TextField label="Label" value={item.label} onChange={(label) => update({ label })} />
                      <TextField label="Value" value={item.value} onChange={(value) => update({ value })} />
                      <TextField label="Id" value={item.id} onChange={(id) => update({ id })} />
                    </>
                  )}
                </ItemList>
              </Group>

              <ItemList
                label="Music video embeds"
                hint="Use official YouTube embed URLs. These are shown in the music section."
                items={content.music.videos}
                onChange={(videos) => patch("music")({ ...content.music, videos })}
                itemLabel="video"
                title={(item) => item.title || item.id}
                makeItem={(items) => ({
                  id: uniqueSlug("video", items.map((entry) => entry.id)),
                  title: "New music video",
                  embedUrl: "",
                })}
                addLabel="Add music video"
              >
                {(item, update) => (
                  <>
                    <TextField label="Title" value={item.title} onChange={(title) => update({ title })} />
                    <TextField
                      label="YouTube embed URL"
                      hint="Example: https://www.youtube.com/embed/VIDEO_ID"
                      value={item.embedUrl}
                      onChange={(embedUrl) => update({ embedUrl })}
                    />
                    <TextField label="Id" value={item.id} onChange={(id) => update({ id })} />
                  </>
                )}
              </ItemList>
            </Panel>
          )}

          {panel === "projects" && (
            <Panel
              title="Notable projects"
              note="The headline runs across three parts so the hand-drawn ring can sit on the middle phrase."
            >
              <Group title="Headline">
                <TextField
                  label="Before"
                  value={content.projects.headline.before}
                  onChange={(before) =>
                    patch("projects")({
                      ...content.projects,
                      headline: { ...content.projects.headline, before },
                    })
                  }
                />
                <TextField
                  label="Circled phrase"
                  hint="The ring is drawn over this"
                  value={content.projects.headline.circled}
                  onChange={(circled) =>
                    patch("projects")({
                      ...content.projects,
                      headline: { ...content.projects.headline, circled },
                    })
                  }
                />
                <TextField
                  label="After"
                  value={content.projects.headline.after}
                  onChange={(after) =>
                    patch("projects")({
                      ...content.projects,
                      headline: { ...content.projects.headline, after },
                    })
                  }
                />
              </Group>

              <ItemList
                label="Projects"
                items={content.projects.items}
                onChange={(items) => patch("projects")({ ...content.projects, items })}
                itemLabel="project"
                title={(item) => item.plate?.replace(/\n/g, " ") || item.id}
                makeItem={(items) => ({
                  id: uniqueSlug("project", items.map((entry) => entry.id)),
                  caption: "",
                  plate: "new",
                  accent: "tape",
                })}
                addLabel="Add project"
              >
                {(item, update) => (
                  <>
                    <TextArea
                      label="Plate text"
                      hint="Set on the card itself. A line break splits it across two lines."
                      rows={2}
                      value={item.plate}
                      onChange={(plate) => update({ plate })}
                    />
                    <TextArea
                      label="Caption"
                      hint="The blue line under the card"
                      rows={2}
                      value={item.caption}
                      onChange={(caption) => update({ caption })}
                    />
                    <SelectField
                      label="Accent"
                      hint="How the card is fixed to the page"
                      value={item.accent}
                      options={ACCENTS}
                      onChange={(accent) => update({ accent })}
                    />
                    <TextField label="Id" value={item.id} onChange={(id) => update({ id })} />
                  </>
                )}
              </ItemList>
            </Panel>
          )}

          {panel === "contact" && (
            <Panel title="Contact" note="Used on the contact slab. The links are built from these.">
              <TextField
                label="Instagram handle"
                hint="Handle only — no @ and no URL"
                value={content.contact.instagram}
                onChange={(instagram) => patch("contact")({ ...content.contact, instagram })}
              />
              <TextField
                label="Email"
                type="email"
                value={content.contact.email}
                onChange={(email) => patch("contact")({ ...content.contact, email })}
              />
              <TextField
                label="Location"
                value={content.contact.location}
                onChange={(location) => patch("contact")({ ...content.contact, location })}
              />
            </Panel>
          )}
        </main>
      </div>

      <MobileSectionSheet
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
        panel={panel}
        onNavigate={goTo}
      />

      <nav className="ad-mobile-dock" aria-label="Mobile workspace actions">
        <button
          className={`ad-mobile-dock-button${panel === "dashboard" ? " is-active" : ""}`}
          type="button"
          onClick={() => goTo("dashboard")}
        >
          <IconDashboard />
          <span>Home</span>
        </button>
        <button
          className={`ad-mobile-dock-button${mobileNavOpen ? " is-active" : ""}`}
          type="button"
          aria-expanded={mobileNavOpen}
          aria-controls="mobile-section-sheet"
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <IconCompass />
          <span>Sections</span>
        </button>
        <button
          className={`ad-mobile-dock-button${panel === "history" ? " is-active" : ""}`}
          type="button"
          onClick={() => goTo("history")}
        >
          <IconHistory />
          <span>History</span>
        </button>
        <button
          className="ad-mobile-dock-button ad-mobile-dock-button--primary"
          type="button"
          onClick={Boolean(draftUpdatedAt) && !dirty ? publish : save}
          disabled={localPreview || Boolean(busy) || (!dirty && !draftUpdatedAt)}
        >
          <IconCheck />
          <span>{Boolean(draftUpdatedAt) && !dirty ? "Publish" : "Save"}</span>
        </button>
      </nav>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Dashboard
   ------------------------------------------------------------------------ */

function MobileSectionSheet({ open, onOpenChange, panel, onNavigate }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent id="mobile-section-sheet" side="bottom" className="ad-framework-mobile-sheet" aria-describedby="mobile-section-sheet-description">
        <SheetHeader className="ad-framework-mobile-sheet-head">
          <span className="ad-framework-mobile-sheet-kicker">MMONN Studio</span>
          <SheetTitle>Choose a section</SheetTitle>
          <SheetDescription id="mobile-section-sheet-description">
            Your current edits stay on screen while you move between sections.
          </SheetDescription>
        </SheetHeader>

        <div className="ad-framework-mobile-sheet-list">
          {NAV_GROUPS.map((group) => (
            <section key={group} aria-label={group}>
              <p>{group}</p>
              {PANELS.filter((entry) => entry.group === group).map((entry) => (
                <button
                  className={`ad-framework-mobile-sheet-item${panel === entry.id ? " is-active" : ""}`}
                  type="button"
                  key={entry.id}
                  aria-current={panel === entry.id ? "page" : undefined}
                  onClick={() => onNavigate(entry.id)}
                >
                  <entry.icon />
                  <span>{entry.label}</span>
                  {panel === entry.id && <IconCheck />}
                </button>
              ))}
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const DASHBOARD_CARDS = [
  {
    id: "collaborations",
    icon: IconUsers,
    label: "Major collaborations",
    count: (c) => c.collaborations.length,
    unit: (n) => `release${n === 1 ? "" : "s"}`,
  },
  {
    id: "milestones",
    icon: IconChart,
    label: "Streaming milestones",
    count: (c) => c.milestones.slides.length,
    unit: (n) => `slide${n === 1 ? "" : "s"}`,
  },
  {
    id: "performances",
    icon: IconImage,
    label: "Performances",
    count: (c) => c.performances.slides.length,
    unit: (n) => `GIF${n === 1 ? "" : "s"}`,
  },
  {
    id: "media",
    icon: IconMegaphone,
    label: "Media coverage",
    count: (c) => c.media.length,
    unit: (n) => `outlet${n === 1 ? "" : "s"}`,
  },
  {
    id: "projects",
    icon: IconStar,
    label: "Notable projects",
    count: (c) => c.projects.items.length,
    unit: (n) => `project${n === 1 ? "" : "s"}`,
  },
  {
    id: "music",
    icon: IconMusic,
    label: "Music",
    count: (c) => c.music.videos.length,
    unit: (n) => `video${n === 1 ? "" : "s"}`,
  },
  {
    id: "navigation",
    icon: IconCompass,
    label: "Navigation",
    count: (c) => c.sections.length,
    unit: (n) => `link${n === 1 ? "" : "s"}`,
  },
  {
    id: "about",
    icon: IconInfo,
    label: "About",
    count: (c) => c.about.paragraphs.length,
    unit: (n) => `paragraph${n === 1 ? "" : "s"}`,
  },
  {
    id: "hero",
    icon: IconHero,
    label: "Hero",
    count: (c) => c.hero.roles.length,
    unit: (n) => `role${n === 1 ? "" : "s"}`,
  },
  {
    id: "contact",
    icon: IconMail,
    label: "Contact",
    describe: (c) => c.contact.email,
  },
];

function formatRelativeTime(iso) {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Dashboard({ content, draftUpdatedAt, history, publishedAt, session, onNavigate }) {
  return (
    <div className="ad-panel">
      <header className="ad-panel-head">
        <h2>Dashboard</h2>
        <p>An overview of everything on the site. Click a card to jump straight to it.</p>
      </header>

      <div className="ad-dashboard-layout">
        <div className="ad-dashboard-grid">
          {DASHBOARD_CARDS.map((card) => (
            <button
              className="ad-dashboard-card"
              type="button"
              key={card.id}
              onClick={() => onNavigate(card.id)}
            >
              <div className="ad-dashboard-card-top">
                <span className="ad-dashboard-card-icon">
                  <card.icon />
                </span>
              </div>
              <h3>{card.label}</h3>
              <p>
                {card.count ? (
                  <>
                    <NumberTicker value={card.count(content)} className="ad-dashboard-card-count-value" />{" "}
                    {card.unit(card.count(content))}
                  </>
                ) : (
                  card.describe(content)
                )}
              </p>
            </button>
          ))}
        </div>

        <div className="ad-dashboard-side">
          <div className="ad-summary-card">
            <h3>Account</h3>
            <dl className="ad-summary-list">
              <div className="ad-summary-row">
                <dt>Telegram editor</dt>
                <dd title={session.user.username ? `@${session.user.username}` : session.user.id}>{session.user.name}</dd>
              </div>
              <div className="ad-summary-row">
                <dt>Access</dt>
                <dd>Verified + allowlisted</dd>
              </div>
              <div className="ad-summary-row">
                <dt>Live site</dt>
                <dd>{publishedAt ? formatRelativeTime(publishedAt) : "Unknown"}</dd>
              </div>
              <div className="ad-summary-row">
                <dt>Draft</dt>
                <dd>{draftUpdatedAt ? `Saved ${formatRelativeTime(draftUpdatedAt)}` : "No draft"}</dd>
              </div>
            </dl>
          </div>

          <div className="ad-summary-card">
            <h3 className="ad-summary-card-title">
              <IconHistory /> Recent activity
            </h3>
            {history.length === 0 ? (
              <p className="ad-summary-empty">No saves yet.</p>
            ) : (
              <dl className="ad-summary-list">
                {history.slice(0, 5).map((entry, index) => (
                  <div
                    className="ad-summary-row ad-summary-row--enter"
                    key={entry.id || entry.published_at}
                    style={{ animationDelay: `${index * 45}ms` }}
                  >
                    <dt>{index === 0 ? "Last publish" : "Published"}</dt>
                    <dd>{formatRelativeTime(entry.published_at)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({ history, onRestore }) {
  return (
    <Panel
      title="Drafts & history"
      note="Every publish is versioned with the Telegram editor and timestamp. Restoring creates a draft first, so the live site never changes without a new Publish confirmation."
    >
      {history.length === 0 ? (
        <div className="ad-empty">
          <IconHistory width="28" height="28" />
          <strong>No published versions yet</strong>
          <span>Publish the first reviewed draft to start version history.</span>
        </div>
      ) : (
        <div className="ad-history-list">
          {history.map((entry) => (
            <article className="ad-history-entry" key={entry.id}>
              <div>
                <p className="ad-history-time">{new Date(entry.published_at).toLocaleString()}</p>
                <h3>{entry.summary || "Published content"}</h3>
                <p>Published by {entry.editor_name || "Telegram editor"}</p>
              </div>
              <button className="ad-button ad-button--quiet" type="button" onClick={() => onRestore(entry)}>
                Restore to draft
              </button>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Panel({ title, note, children }) {
  return (
    <section className="ad-panel">
      <header className="ad-panel-head">
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {children}
    </section>
  );
}

function Group({ title, children }) {
  return (
    <section className="ad-group">
      <h3 className="ad-group-title">{title}</h3>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Boot states
   ------------------------------------------------------------------------ */

function BootScreen({ message, error, hint, action }) {
  return (
    <div className="ad-boot">
      <div className="ad-boot-brand">
        <span className="ad-boot-mark" aria-hidden="true">
          M
        </span>
        {!error && <span className="ad-spinner" aria-hidden="true" />}
      </div>
      <p className={`ad-status ad-status--${error ? "error" : "info"}`} role="status">
        {message}
      </p>
      {hint && <p className="ad-boot-hint">{hint}</p>}
      {action && (
        <button className="ad-button" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

function TelegramAccessScreen({ error }) {
  return (
    <div className="ad-boot">
      <div className="ad-signin">
        <div className="ad-signin-head">
          <span className="ad-boot-mark" aria-hidden="true">M</span>
          <div>
            <h1>MMONN — editor</h1>
            <p className="ad-signin-note">This private workspace can only be opened from the authorized Telegram account.</p>
          </div>
        </div>
        <p className="ad-signin-message ad-signin-message--error" role="alert">
          {error || "Open the editor with the /edit command in the MMONN Telegram bot."}
        </p>
        <p className="ad-boot-hint">Direct browser access is intentionally disabled.</p>
      </div>
    </div>
  );
}
