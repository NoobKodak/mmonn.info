import { useEffect, useId, useMemo, useRef, useState } from "react";

import { contentAsset } from "../lib/content-asset.js";
import { useConfirm } from "./feedback.jsx";
import {
  IconChevronRight,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconImage,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
} from "./icons.jsx";

/* ---------------------------------------------------------------------------
   Primitive fields
   ------------------------------------------------------------------------ */

export function Field({ label, hint, children }) {
  return (
    <label className="ad-field">
      <span className="ad-field-label">
        {label}
        {hint && <span className="ad-field-hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function TextField({ label, hint, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="ad-input"
        type="text"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </Field>
  );
}

/** A password field with a show/hide toggle — off by default, as any password field should be. */
export function PasswordField({ label, hint, value, onChange, ...rest }) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} hint={hint}>
      <div className="ad-password-row">
        <input
          className="ad-input"
          type={visible ? "text" : "password"}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          {...rest}
        />
        <button
          className="ad-password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
    </Field>
  );
}

export function NumberField({ label, hint, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="ad-input"
        type="number"
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "" ? 0 : Number(next));
        }}
        {...rest}
      />
    </Field>
  );
}

/** Grows with its content so long copy stays readable while editing. */
export function TextArea({ label, hint, value, onChange, rows = 4, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <Field label={label} hint={hint}>
      <textarea
        className="ad-input ad-textarea"
        ref={ref}
        rows={rows}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </Field>
  );
}

export function SelectField({ label, hint, value, options, onChange }) {
  return (
    <Field label={label} hint={hint}>
      <select className="ad-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Field>
  );
}

/* ---------------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------------ */

export function EmptyState({ icon, title, hint }) {
  const Icon = icon || IconFolder;
  return (
    <div className="ad-empty">
      <Icon width="28" height="28" />
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Repeatable lists
   ------------------------------------------------------------------------ */

/**
 * Reordering uses buttons rather than drag-and-drop: it needs no dependency,
 * works from the keyboard, and is announced properly by a screen reader.
 * Removing always confirms first — nothing in the panel deletes on one click.
 */
function RowControls({ index, count, onMove, onRemove, label, itemNoun = "item", canRemove = true }) {
  const confirm = useConfirm();

  const handleRemove = async () => {
    const ok = await confirm({
      title: `Remove ${itemNoun}?`,
      message: `“${label}” will be deleted. This can’t be undone.`,
      confirmLabel: "Remove",
    });
    if (ok) onRemove(index);
  };

  return (
    <div className="ad-row-controls">
      <button
        className="ad-icon-button"
        type="button"
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        title="Move up"
      >
        <IconChevronRight style={{ rotate: "-90deg" }} />
      </button>
      <button
        className="ad-icon-button"
        type="button"
        onClick={() => onMove(index, index + 1)}
        disabled={index === count - 1}
        aria-label={`Move ${label} down`}
        title="Move down"
      >
        <IconChevronRight style={{ rotate: "90deg" }} />
      </button>
      <button
        className="ad-icon-button ad-icon-button--danger"
        type="button"
        onClick={handleRemove}
        disabled={!canRemove}
        aria-label={`Remove ${label}`}
        title={canRemove ? "Remove" : "At least one entry is required"}
      >
        <IconTrash />
      </button>
    </div>
  );
}

export function move(items, from, to) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A list of plain strings — the hero roles, the About paragraphs. */
export function StringList({
  label,
  hint,
  items,
  onChange,
  multiline = false,
  addLabel = "Add",
  itemLabel = "item",
  min = 1,
}) {
  const Input = multiline ? "textarea" : "input";

  return (
    <div className="ad-list">
      <div className="ad-list-head">
        <h3 className="ad-list-title">{label}</h3>
        <span className="ad-list-count">
          {items.length} {items.length === 1 ? itemLabel : `${itemLabel}s`}
        </span>
        {hint && <p className="ad-list-hint">{hint}</p>}
      </div>

      {items.length === 0 && (
        <EmptyState title={`No ${itemLabel}s yet`} hint={`Add the first one below.`} />
      )}

      {items.map((item, index) => (
        <div className="ad-row" key={index}>
          <Input
            className={`ad-input${multiline ? " ad-textarea" : ""}`}
            rows={multiline ? 5 : undefined}
            value={item}
            aria-label={`${itemLabel} ${index + 1}`}
            onChange={(event) => {
              const next = [...items];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <RowControls
            index={index}
            count={items.length}
            label={item || `${itemLabel} ${index + 1}`}
            itemNoun={itemLabel}
            canRemove={items.length > min}
            onMove={(from, to) => onChange(move(items, from, to))}
            onRemove={(at) => onChange(items.filter((_, i) => i !== at))}
          />
        </div>
      ))}

      <button className="ad-add" type="button" onClick={() => onChange([...items, ""])}>
        <IconPlus /> {addLabel}
      </button>
    </div>
  );
}

/**
 * A list of objects, each an accordion card rendered by `children`. The first
 * card starts open so the shape of an entry is visible at a glance; the rest
 * start closed to keep a six- or eight-entry list scannable. Adding a new
 * entry opens it immediately, since that is the one you are about to fill in.
 */
export function ItemList({
  label,
  hint,
  items,
  onChange,
  makeItem,
  addLabel = "Add",
  itemLabel = "entry",
  title,
  thumbnail,
  children,
  min = 0,
}) {
  const [openIds, setOpenIds] = useState(() => new Set(items[0] ? [rowKey(items[0], 0)] : []));

  const toggle = (key) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addItem = () => {
    const next = [...items, makeItem(items)];
    onChange(next);
    setOpenIds((current) => new Set(current).add(rowKey(next[next.length - 1], next.length - 1)));
  };

  return (
    <div className="ad-list">
      <div className="ad-list-head">
        <h3 className="ad-list-title">{label}</h3>
        <span className="ad-list-count">
          {items.length} {items.length === 1 ? itemLabel : `${itemLabel}s`}
        </span>
        {hint && <p className="ad-list-hint">{hint}</p>}
      </div>

      {items.length === 0 && (
        <EmptyState title={`No ${itemLabel}s yet`} hint="Add the first one below to get started." />
      )}

      {items.map((item, index) => {
        const key = rowKey(item, index);
        const isOpen = openIds.has(key);
        const displayTitle = title ? title(item) : `${itemLabel} ${index + 1}`;
        const thumbSrc = thumbnail?.(item);

        return (
          <article className={`ad-card${isOpen ? " is-open" : ""}`} key={key}>
            <div className="ad-card-toggle-row">
              <button
                className="ad-card-toggle"
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(key)}
              >
                <span className="ad-card-thumb" aria-hidden="true">
                  {thumbSrc ? <img src={contentAsset(thumbSrc)} alt="" loading="lazy" /> : <IconImage />}
                </span>
                <h4 className="ad-card-title">
                  <span className="ad-card-index">{String(index + 1).padStart(2, "0")}</span>
                  {displayTitle}
                </h4>
                <span className="ad-card-chevron">
                  <IconChevronRight />
                </span>
              </button>
              <div className="ad-card-controls">
                <RowControls
                  index={index}
                  count={items.length}
                  label={displayTitle}
                  itemNoun={itemLabel}
                  canRemove={items.length > min}
                  onMove={(from, to) => onChange(move(items, from, to))}
                  onRemove={(at) => onChange(items.filter((_, i) => i !== at))}
                />
              </div>
            </div>

            {isOpen && (
              <div className="ad-card-body">
                {children(
                  item,
                  (patch) => {
                    const next = [...items];
                    next[index] = { ...next[index], ...patch };
                    onChange(next);
                  },
                  index,
                )}
              </div>
            )}
          </article>
        );
      })}

      {makeItem && (
        <button className="ad-add" type="button" onClick={addItem}>
          <IconPlus /> {addLabel}
        </button>
      )}
    </div>
  );
}

function rowKey(item, index) {
  return item?.id ?? index;
}

/* ---------------------------------------------------------------------------
   Asset picker
   ------------------------------------------------------------------------ */

/**
 * Picks an image already available to the site (bundled in the project, or
 * previously uploaded), or uploads a new one straight to Supabase Storage.
 */
export function AssetField({ label, hint, value, assets, onChange, onUpload, allowEmpty = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const listId = useId();

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    // Cleared straight away so choosing the same file twice still fires.
    event.target.value = "";
    if (!file || !onUpload) return;

    setUploading(true);
    setUploadError("");
    try {
      const path = await onUpload(file);
      onChange(path);
      setOpen(false);
    } catch (error) {
      setUploadError(error.message);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const sync = () => setOpen(false);
    dialog.addEventListener("close", sync);
    return () => dialog.removeEventListener("close", sync);
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) => asset.path.toLowerCase().includes(needle));
  }, [assets, query]);

  return (
    <div className="ad-asset">
      <Field label={label} hint={hint}>
        <div className="ad-asset-row">
          <input
            className="ad-input"
            type="text"
            value={value ?? ""}
            placeholder={allowEmpty ? "None chosen" : "Choose an image"}
            onChange={(event) => onChange(event.target.value)}
          />
          <button className="ad-button ad-button--quiet ad-button--sm" type="button" onClick={() => setOpen(true)}>
            <IconFolder /> <span className="ad-button-label">Browse</span>
          </button>
          {onUpload && (
            <>
              <button
                className="ad-button ad-button--quiet ad-button--sm"
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <IconUpload /> <span className="ad-button-label">{uploading ? "Uploading…" : "Upload"}</span>
              </button>
              <input
                className="visually-hidden"
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp,image/avif"
                onChange={handleFile}
              />
            </>
          )}
          {allowEmpty && value && (
            <button className="ad-button ad-button--quiet ad-button--sm" type="button" onClick={() => onChange("")}>
              Clear
            </button>
          )}
        </div>
      </Field>

      {uploadError && <p className="ad-asset-error">{uploadError}</p>}

      {value && (
        <div className="ad-asset-preview">
          <img src={contentAsset(value)} alt="" loading="lazy" />
        </div>
      )}

      <dialog className="ad-dialog" ref={dialogRef}>
        <header className="ad-dialog-head">
          <h3>Choose an image</h3>
          <button className="ad-icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close">
            <IconX />
          </button>
        </header>

        <input
          className="ad-input"
          type="search"
          value={query}
          placeholder="Filter by name"
          aria-controls={listId}
          onChange={(event) => setQuery(event.target.value)}
        />

        <ul className="ad-asset-grid" id={listId}>
          {matches.map((asset) => (
            <li key={asset.path}>
              <button
                className={`ad-asset-tile${asset.path === value ? " is-current" : ""}`}
                type="button"
                onClick={() => {
                  onChange(asset.path);
                  setOpen(false);
                }}
              >
                <img src={contentAsset(asset.path)} alt="" loading="lazy" />
                <span className="ad-asset-name">{asset.path}</span>
              </button>
            </li>
          ))}
          {!matches.length && (
            <li className="ad-asset-empty">
              {assets.length === 0 ? "No images yet — upload one above." : "No files match that filter."}
            </li>
          )}
        </ul>
      </dialog>
    </div>
  );
}
