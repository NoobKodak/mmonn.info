import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";

import { contentAsset } from "../lib/content-asset.js";
import { Button } from "./components/ui/button.jsx";
import { Input } from "./components/ui/input.jsx";
import { Label } from "./components/ui/label.jsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select.jsx";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./components/ui/sheet.jsx";
import { Textarea } from "./components/ui/textarea.jsx";
import { useConfirm } from "./feedback.jsx";
import { IconChevronRight, IconEye, IconEyeOff, IconFolder, IconImage, IconPlus, IconTrash, IconUpload } from "./icons.jsx";

/* ---------------------------------------------------------------------------
   Primitive fields
   ------------------------------------------------------------------------ */

/** Wraps a control in a native, implicitly-associated label — Radix's Label
 *  still renders a plain <label> element, so nesting the control keeps the
 *  same accessible behavior the hand-rolled version had. */
export function Field({ label, hint, children }) {
  return (
    <Label className="flex w-full flex-col items-start gap-1.5 text-sm font-medium text-foreground">
      <span className="flex flex-wrap items-baseline gap-x-2">
        {label}
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </Label>
  );
}

export function TextField({ label, hint, value, onChange, className, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        className={cn("h-11 text-base", className)}
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
      <div className="flex w-full items-center gap-2">
        <Input
          className="h-11 flex-1 text-base"
          type={visible ? "text" : "password"}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          {...rest}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-touch"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </Button>
      </div>
    </Field>
  );
}

export function NumberField({ label, hint, value, onChange, className, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <Input
        className={cn("h-11 text-base", className)}
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
export function TextArea({ label, hint, value, onChange, rows = 4, className, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <Field label={label} hint={hint}>
      <Textarea
        className={cn("min-h-11 text-base", className)}
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
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 w-full text-base">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/* ---------------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------------ */

export function EmptyState({ icon, title, hint }) {
  const Icon = icon || IconFolder;
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
      <Icon width="28" height="28" />
      <strong className="text-sm font-medium text-foreground">{title}</strong>
      {hint && <span className="text-sm">{hint}</span>}
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
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        onClick={() => onMove(index, index - 1)}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        title="Move up"
      >
        <IconChevronRight style={{ rotate: "-90deg" }} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        onClick={() => onMove(index, index + 1)}
        disabled={index === count - 1}
        aria-label={`Move ${label} down`}
        title="Move down"
      >
        <IconChevronRight style={{ rotate: "90deg" }} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-touch"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={handleRemove}
        disabled={!canRemove}
        aria-label={`Remove ${label}`}
        title={canRemove ? "Remove" : "At least one entry is required"}
      >
        <IconTrash />
      </Button>
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
  const InputComponent = multiline ? Textarea : Input;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          <span className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? itemLabel : `${itemLabel}s`}
          </span>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      {items.length === 0 && <EmptyState title={`No ${itemLabel}s yet`} hint="Add the first one below." />}

      {items.map((item, index) => (
        <div className="flex items-start gap-2" key={index}>
          <InputComponent
            className={cn("h-11 flex-1 text-base", multiline && "min-h-11")}
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

      <Button type="button" variant="outline" size="touch" className="self-start" onClick={() => onChange([...items, ""])}>
        <IconPlus /> {addLabel}
      </Button>
    </div>
  );
}

function rowKey(item, index) {
  return item?.id ?? index;
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          <span className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? itemLabel : `${itemLabel}s`}
          </span>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      {items.length === 0 && <EmptyState title={`No ${itemLabel}s yet`} hint="Add the first one below to get started." />}

      {items.map((item, index) => {
        const key = rowKey(item, index);
        const isOpen = openIds.has(key);
        const displayTitle = title ? title(item) : `${itemLabel} ${index + 1}`;
        const thumbSrc = thumbnail?.(item);

        return (
          <article
            key={key}
            className={cn(
              "flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground",
              isOpen && "ring-1 ring-ring/30",
            )}
          >
            <div className="flex items-center gap-1 p-2">
              <button
                type="button"
                className="flex min-h-11 flex-1 items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-muted/50"
                aria-expanded={isOpen}
                onClick={() => toggle(key)}
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground"
                  aria-hidden="true"
                >
                  {thumbSrc ? (
                    <img src={contentAsset(thumbSrc)} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <IconImage />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm font-medium">
                  <span className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate">{displayTitle}</span>
                </span>
                <IconChevronRight className={cn("shrink-0 transition-transform", isOpen && "rotate-90")} />
              </button>
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

            {isOpen && (
              <div className="flex flex-col gap-4 border-t border-border p-4">
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
        <Button type="button" variant="outline" size="touch" className="self-start" onClick={addItem}>
          <IconPlus /> {addLabel}
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Asset picker
   ------------------------------------------------------------------------ */

/**
 * Picks an image already available to the site (bundled in the project, or
 * previously uploaded), or uploads a new one straight to Supabase Storage.
 * The picker is a bottom Sheet rather than a centered dialog — it reads as a
 * native mobile picker and needs no extra work to be usable on a phone.
 */
export function AssetField({ label, hint, value, assets, onChange, onUpload, allowEmpty = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
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

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) => asset.path.toLowerCase().includes(needle));
  }, [assets, query]);

  return (
    <div className="flex flex-col gap-2">
      <Field label={label} hint={hint}>
        <div className="flex w-full flex-wrap items-center gap-2">
          <Input
            className="h-11 min-w-0 flex-1 text-base"
            type="text"
            value={value ?? ""}
            placeholder={allowEmpty ? "None chosen" : "Choose an image"}
            onChange={(event) => onChange(event.target.value)}
          />
          <Button type="button" variant="outline" size="touch" onClick={() => setOpen(true)}>
            <IconFolder /> Browse
          </Button>
          {onUpload && (
            <>
              <Button type="button" variant="outline" size="touch" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <IconUpload /> {uploading ? "Uploading…" : "Upload"}
              </Button>
              <input
                className="sr-only"
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp,image/avif"
                onChange={handleFile}
              />
            </>
          )}
          {allowEmpty && value && (
            <Button type="button" variant="ghost" size="touch" onClick={() => onChange("")}>
              Clear
            </Button>
          )}
        </div>
      </Field>

      {onUpload && (
        <p className="text-xs leading-5 text-muted-foreground">
          Photos over 3.5 MB are prepared for upload automatically. GIFs, SVGs, and AVIF files must already be below 4 MB.
        </p>
      )}

      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

      {value && (
        <div className="overflow-hidden rounded-lg border border-border">
          <img src={contentAsset(value)} alt="" loading="lazy" className="block max-h-48 w-full object-contain" />
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>Choose an image</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
            <Input
              className="h-11 text-base"
              type="search"
              value={query}
              placeholder="Filter by name"
              aria-controls={listId}
              onChange={(event) => setQuery(event.target.value)}
            />

            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" id={listId}>
              {matches.map((asset) => (
                <li key={asset.path}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg border border-border p-2 text-left hover:bg-muted/50",
                      asset.path === value && "border-ring ring-1 ring-ring",
                    )}
                    onClick={() => {
                      onChange(asset.path);
                      setOpen(false);
                    }}
                  >
                    <img
                      src={contentAsset(asset.path)}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full rounded-md object-cover"
                    />
                    <span className="truncate text-xs text-muted-foreground">{asset.path}</span>
                  </button>
                </li>
              ))}
              {!matches.length && (
                <li className="col-span-full py-6 text-center text-sm text-muted-foreground">
                  {assets.length === 0 ? "No images yet — upload one above." : "No files match that filter."}
                </li>
              )}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
