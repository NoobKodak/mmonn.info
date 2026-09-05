import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { publicAsset } from "../assets.js";
import {
  buildSite,
  getSession,
  loadAssets,
  loadLocalAssets,
  loadContent,
  loadRecentHistory,
  onAuthStateChange,
  saveContent,
  signIn,
  signOut,
  signUp,
  uploadAsset,
} from "./api.js";
import { ConfirmProvider, ToastProvider, useToast } from "./feedback.jsx";
import {
  IconChart,
  IconCompass,
  IconDashboard,
  IconExternal,
  IconHammer,
  IconHero,
  IconHistory,
  IconInfo,
  IconLock,
  IconLogOut,
  IconMail,
  IconMegaphone,
  IconRefresh,
  IconStar,
  IconUsers,
} from "./icons.jsx";
import {
  AssetField,
  ItemList,
  NumberField,
  PasswordField,
  SelectField,
  StringList,
  TextArea,
  TextField,
} from "./ui.jsx";
import "./admin.css";

const PANELS = [
  { id: "dashboard", label: "Dashboard", icon: IconDashboard, group: "Overview" },
  { id: "hero", label: "Hero", icon: IconHero, group: "Content" },
  { id: "navigation", label: "Navigation", icon: IconCompass, group: "Content" },
  { id: "about", label: "About", icon: IconInfo, group: "Content" },
  { id: "collaborations", label: "Collaborations", icon: IconUsers, group: "Content" },
  { id: "milestones", label: "Streaming milestones", icon: IconChart, group: "Content" },
  { id: "media", label: "Media coverage", icon: IconMegaphone, group: "Content" },
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
  media: "media",
  projects: "projects",
  contact: "contact",
};

const ACCENTS = ["tape", "star", "pin"];
const SLIDE_KINDS = ["figures", "mark", "blend", "artwork"];
const TONES = ["dark", "light"];

const emptyImage = () => ({ src: "", width: 0, height: 0, alt: "" });

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
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [content, setContent] = useState(null);
  const [saved, setSaved] = useState(null);
  const [assets, setAssets] = useState([]);
  const [history, setHistory] = useState([]);
  const [revision, setRevision] = useState(null);
  const [panel, setPanel] = useState(PANELS[0].id);
  const [busy, setBusy] = useState("loading");
  const [bootMessage, setBootMessage] = useState("Signing in…");
  const mainRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    getSession().then((current) => {
      if (!cancelled) setSession(current);
    });
    const unsubscribe = onAuthStateChange((next) => setSession(next));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const dirty = useMemo(
    () => Boolean(content && saved) && JSON.stringify(content) !== JSON.stringify(saved),
    [content, saved],
  );

  const refresh = useCallback(async ({ withAssets = false, announce = false } = {}) => {
    setBusy("loading");
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
  }, [toast]);

  // Only once signed in — reading `site_content` needs no auth, but there is
  // nothing useful to show before knowing who (if anyone) is signed in, and
  // loading before that would flash the editor open for a moment on sign-out.
  useEffect(() => {
    if (session) refresh({ withAssets: true });
  }, [session, refresh]);

  const save = useCallback(async () => {
    if (!content || busy) return;
    setBusy("saving");

    try {
      const knownAssets = new Set(assets.map((entry) => entry.path));
      const result = await saveContent(content, revision, { knownAssets });
      setSaved(result.content);
      setContent(result.content);
      setRevision(result.revision);
      toast.push({
        tone: "success",
        message: "Saved. The public site updates immediately — no rebuild needed for that.",
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
  }, [busy, content, revision, assets, panel, toast]);

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

  const build = async () => {
    if (busy) return;
    setBusy("building");
    try {
      const result = await buildSite();
      toast.push({ tone: result.ok ? "success" : "error", message: result.message });
    } catch (error) {
      toast.push({ tone: "error", message: error.message });
    } finally {
      setBusy(null);
    }
  };

  const patch = (key) => (value) => setContent((current) => ({ ...current, [key]: value }));

  /** Uploads land in Supabase Storage and join the picker straight away, so a
   *  newly added file can be chosen without reloading the editor. */
  const handleUpload = async (file) => {
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
    mainRef.current?.scrollTo({ top: 0 });
  };

  if (session === undefined) {
    return <BootScreen message="Signing in…" />;
  }

  if (!session) {
    return <SignInScreen />;
  }

  if (!content) {
    return (
      <BootScreen
        message={bootMessage}
        error={bootMessage !== "Signing in…"}
        hint={
          <>
            Check that <code>site_content</code> has a row with id <code>live</code>, and that this
            account is confirmed and signed in.
          </>
        }
        action={{ label: "Try again", onClick: () => refresh({ withAssets: true }) }}
      />
    );
  }

  const saveState = busy === "saving" ? "saving" : dirty ? "dirty" : "saved";
  const currentPanel = PANELS.find((entry) => entry.id === panel) ?? PANELS[0];

  return (
    <div className="ad">
      <header className="ad-top">
        <div className="ad-brand">
          <span className="ad-brand-mark" aria-hidden="true">
            M
          </span>
          <div className="ad-brand-text">
            <h1>MMONN — content</h1>
            <span className="ad-brand-sub">{currentPanel.label}</span>
          </div>
        </div>

        <div className="ad-actions">
          <span className={`ad-state ad-state--${saveState}`} role="status">
            <span className="ad-state-dot" aria-hidden="true" />
            {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : "All changes saved"}
          </span>

          <span className="ad-account" title={session.user.email}>
            {session.user.email}
          </span>

          <a className="ad-button ad-button--quiet ad-button--icon-collapse" href="/" target="_blank" rel="noreferrer">
            <IconExternal /> <span className="ad-button-label">View site</span>
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

          <button
            className="ad-button ad-button--quiet ad-button--icon-collapse"
            type="button"
            onClick={build}
            disabled={Boolean(busy)}
            title="Build the static export in dist/ (this machine only)"
          >
            <IconHammer /> <span className="ad-button-label">{busy === "building" ? "Building…" : "Build site"}</span>
          </button>

          <button
            className="ad-button ad-button--quiet ad-button--icon-collapse"
            type="button"
            onClick={() => signOut()}
          >
            <IconLogOut /> <span className="ad-button-label">Sign out</span>
          </button>

          <button className="ad-button" type="button" onClick={save} disabled={!dirty || Boolean(busy)}>
            {busy === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="ad-body">
        <nav className="ad-nav" aria-label="Content sections">
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
            <Dashboard content={content} history={history} session={session} onNavigate={goTo} />
          )}

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
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Dashboard
   ------------------------------------------------------------------------ */

const DASHBOARD_CARDS = [
  {
    id: "collaborations",
    icon: IconUsers,
    label: "Major collaborations",
    describe: (c) => `${c.collaborations.length} release${c.collaborations.length === 1 ? "" : "s"}`,
  },
  {
    id: "milestones",
    icon: IconChart,
    label: "Streaming milestones",
    describe: (c) => `${c.milestones.slides.length} slide${c.milestones.slides.length === 1 ? "" : "s"}`,
  },
  {
    id: "media",
    icon: IconMegaphone,
    label: "Media coverage",
    describe: (c) => `${c.media.length} outlet${c.media.length === 1 ? "" : "s"}`,
  },
  {
    id: "projects",
    icon: IconStar,
    label: "Notable projects",
    describe: (c) => `${c.projects.items.length} project${c.projects.items.length === 1 ? "" : "s"}`,
  },
  {
    id: "navigation",
    icon: IconCompass,
    label: "Navigation",
    describe: (c) => `${c.sections.length} link${c.sections.length === 1 ? "" : "s"}`,
  },
  {
    id: "about",
    icon: IconInfo,
    label: "About",
    describe: (c) => `${c.about.paragraphs.length} paragraph${c.about.paragraphs.length === 1 ? "" : "s"}`,
  },
  {
    id: "hero",
    icon: IconHero,
    label: "Hero",
    describe: (c) => `${c.hero.roles.length} role${c.hero.roles.length === 1 ? "" : "s"}`,
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

function Dashboard({ content, history, session, onNavigate }) {
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
              <p>{card.describe(content)}</p>
            </button>
          ))}
        </div>

        <div className="ad-dashboard-side">
          <div className="ad-summary-card">
            <h3>Account</h3>
            <dl className="ad-summary-list">
              <div className="ad-summary-row">
                <dt>Signed in as</dt>
                <dd title={session.user.email}>{session.user.email}</dd>
              </div>
              <div className="ad-summary-row">
                <dt>Backend</dt>
                <dd>Supabase</dd>
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
                {history.map((entry, index) => (
                  <div className="ad-summary-row" key={entry.saved_at}>
                    <dt>{index === 0 ? "Last saved" : "Saved"}</dt>
                    <dd>{formatRelativeTime(entry.saved_at)}</dd>
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

/**
 * There is no editor account until the first person creates one, so this
 * screen offers both: sign in for everyone after that, sign up once at the
 * start. Supabase requires a confirmation click by default — on a fresh
 * project that email arrives from Supabase's own address, not this domain.
 */
function SignInScreen() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        await signUp(email, password);
        setMessage({
          tone: "success",
          text: "Account created. Check your email to confirm it, then sign in.",
        });
        setMode("signin");
      } else {
        await signIn(email, password);
      }
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-boot">
      <form className="ad-signin" onSubmit={submit}>
        <div className="ad-signin-head">
          <span className="ad-boot-mark" aria-hidden="true">
            M
          </span>
          <div>
            <h1>MMONN — content</h1>
            <p className="ad-signin-note">
              {mode === "signup"
                ? "Create the editor account. This only needs doing once."
                : "Sign in to edit the site."}
            </p>
          </div>
        </div>

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          required
        />
        <PasswordField
          label="Password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={setPassword}
          required
        />

        {message && (
          <p className={`ad-signin-message ad-signin-message--${message.tone}`} role="status">
            {message.tone === "success" ? <IconMail /> : <IconLock />}
            {message.text}
          </p>
        )}

        <button className="ad-button" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>

        <div className="ad-signin-divider" />

        <button
          className="ad-button ad-button--quiet"
          type="button"
          onClick={() => {
            setMode((current) => (current === "signup" ? "signin" : "signup"));
            setMessage(null);
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "First time here? Create an account"}
        </button>
      </form>
    </div>
  );
}
