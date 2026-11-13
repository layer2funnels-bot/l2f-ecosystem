"use client";
// Style / arrange / checklist controls for the inspector. Everything here is presentational or planning data:
// none of it changes the funnel maths.
import { encodeUnder } from "@/lib/image-client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { typeOf } from "@/lib/catalog";
import type { ChecklistItem, FunnelEdge, FunnelNode } from "@/lib/graph";
import { ICONS, type IconName } from "@/lib/icons";
import { EDGE_PRESETS, QUICK_STYLES, FONT_FAMILIES, FONT_WEIGHTS, type EdgeStyle, type FontFamily, type NodeStyle } from "@/lib/style";
import { saveStylePreset } from "./assets";
import { applyQuickStyle, armEyedropper, copyStyle, pasteStyle, checklistOf, copySelection, deleteSelection, duplicateSelection, moveNodes, newChecklistItem, reorder, setChecklist, setEdgeStyle, setLocked, setNodeStyle, showToast, updateParams, useEditor } from "@/lib/editor/store";
import { Field, Seg } from "./fields";

/* ---------------- small inputs ---------------- */

/** Number input where empty means "default" (undefined). */
function OptNum({ label, value, onChange, min, max, step = "any", placeholder }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min?: number; max?: number; step?: string | number; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const v = value != null && Number.isFinite(value) ? String(value) : "";
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          className="input"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          placeholder={placeholder ?? "Auto"}
          value={draft ?? v}
          onFocus={() => setDraft(v)}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value === "") return onChange(undefined);
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
          }}
        />
      )}
    </Field>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;
/** Colour picker + hex box; empty = default colour. */
function ColorField({ label, value, onChange, fallback = "#10b981" }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; fallback?: string }) {
  return (
    <Field label={label}>
      {(id) => (
        <div className="fm-color">
          <input type="color" aria-label={`${label} picker`} value={value && HEX.test(value) ? value : fallback} onChange={(e) => onChange(e.target.value)} />
          <input id={id} className="input" value={value ?? ""} placeholder="Default" onChange={(e) => onChange(e.target.value.trim() || undefined)} />
          {value && (
            <button type="button" className="btn sm ghost" onClick={() => onChange(undefined)} aria-label={`Reset ${label.toLowerCase()}`}>
              Reset
            </button>
          )}
        </div>
      )}
    </Field>
  );
}

function Toggle({ label, on, onChange, children }: { label: string; on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button type="button" className="btn sm" aria-pressed={on} aria-label={label} title={label} onClick={() => onChange(!on)} style={on ? { borderColor: "var(--brand)", color: "var(--brand-light)" } : undefined}>
      {children}
    </button>
  );
}

/* ---------------- arrange: lock, order, duplicate / copy / delete ---------------- */

export function ArrangeBar({ ids }: { ids: string[] }) {
  const locked = useEditor((s) => ids.length > 0 && ids.every((id) => s.nodes.find((n) => n.id === id)?.locked));
  return (
    <div className="fm-sec">
      <h4>Arrange</h4>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" className="btn sm" onClick={() => setLocked(!locked, ids)} aria-pressed={locked}>
          <Icon name={locked ? "unlock" : "lock"} size={14} /> {locked ? "Unlock" : "Lock"}
        </button>
        <button type="button" className="btn sm" onClick={() => reorder("front", ids)}>
          Bring to front
        </button>
        <button type="button" className="btn sm" onClick={() => reorder("forward", ids)}>
          Bring forward
        </button>
        <button type="button" className="btn sm" onClick={() => reorder("backward", ids)}>
          Send backward
        </button>
        <button type="button" className="btn sm" onClick={() => reorder("back", ids)}>
          Send to back
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn sm" onClick={duplicateSelection}>
          Duplicate
        </button>
        <button type="button" className="btn sm" onClick={() => copySelection() && showToast("Copied: paste with Ctrl V")}>
          Copy
        </button>
        <button type="button" className="btn sm danger" onClick={deleteSelection} disabled={locked}>
          Delete
        </button>
      </div>
    </div>
  );
}

/* ---------------- style ---------------- */

const TEXT_TYPES = new Set(["label", "note", "shape", "checklist", "frame", "link"]);

/** Quick styles + copy / paste style + eyedropper. Applies to `ids` (the whole selection). */
/** "Save current" → a named preset for the whole workspace. */
function SavePreset({ ids }: { ids: string[] }) {
  const ro = useEditor((s) => s.readOnly || s.shared);
  const style = useEditor((s) => s.nodes.find((n) => n.id === ids[0])?.s);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (ro) return null;
  if (!open)
    return (
      <button type="button" className="btn sm" disabled={!style} onClick={() => setOpen(true)} title={style ? "Save this style for the whole workspace" : "Style the block first"}>
        Save current
      </button>
    );
  return (
    <form
      className="flex w-full gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        saveStylePreset(name, style);
        setOpen(false);
        setName("");
      }}
    >
      <input className="input min-w-0 flex-1" autoFocus aria-label="Style name" placeholder="Name this style" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} />
      <button className="btn sm primary" disabled={!name.trim()}>
        Save
      </button>
    </form>
  );
}

function StyleShortcuts({ ids }: { ids: string[] }) {
  const hasClip = useEditor((s) => !!s.styleClip);
  const armed = useEditor((s) => s.eyedrop !== null);
  const presets = useEditor((s) => s.stylePresets);
  return (
    <div className="fm-sec">
      <h4>Quick styles</h4>
      <div className="fm-chips" role="group" aria-label="Quick styles">
        {QUICK_STYLES.map((q) => (
          <button key={q.key} type="button" className="chip" onClick={() => applyQuickStyle(q.style, ids)}>
            {q.label}
          </button>
        ))}
        {presets.map((p) => (
          <button key={p.id} type="button" className="chip" onClick={() => applyQuickStyle(p.style, ids)} title="Saved for this workspace">
            {p.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className="btn sm" onClick={() => copyStyle(ids[0])}>
          <Icon name="paint" size={14} /> Copy style
        </button>
        <button type="button" className="btn sm" disabled={!hasClip} onClick={() => pasteStyle(ids)}>
          <Icon name="paint" size={14} /> Paste style
        </button>
        <button type="button" className="btn sm" aria-pressed={armed} onClick={() => armEyedropper(armed ? null : ids[0])}>
          <Icon name="pipette" size={14} /> Eyedropper
        </button>
        <SavePreset ids={ids} />
      </div>
    </div>
  );
}

const ACCENTS = ["#A78BFA", "#10B981", "#FB923C", "#60A5FA", "#2DD4BF", "#FBBF24", "#94A3B8"];

/** A funnel block is a picture or shape with its name under it (V4): colour, icon and the number chip are all that is styled. */
function BlockStyle({ n, all }: { n: FunnelNode; all: string[] }) {
  const st: NodeStyle = n.s ?? {};
  const S = (patch: Partial<NodeStyle>) => setNodeStyle(n.id, patch, all);
  const T = typeOf(n.type);
  const [q, setQ] = useState("");
  const icons = (Object.keys(ICONS) as IconName[]).filter((k) => k.includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="fm-sec">
        <h4>Colour</h4>
        <div className="fm-sbx-sw" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={st.accent === c} aria-label={c} style={{ background: c }} onClick={() => S({ accent: st.accent === c ? undefined : c })} />
          ))}
        </div>
        <p className="help">Colours the type glyph, the bottom bar and the shape. Without one, the block keeps its family colour.</p>
      </div>
      {all.length === 1 && (
        <div className="fm-sec">
          <h4>Icon</h4>
          <div className="flex items-center gap-2">
            <input className="input" placeholder="Search icons" aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
            {st.icon && (
              <button type="button" className="btn sm ghost" onClick={() => S({ icon: undefined })}>
                Default
              </button>
            )}
          </div>
          <div className="fm-icongrid" role="group" aria-label="Icon">
            {icons.map((k) => (
              <button key={k} type="button" aria-pressed={(st.icon || T.icon) === k} aria-label={`Icon ${k}`} title={k} onClick={() => S({ icon: k === T.icon ? undefined : k })}>
                <Icon name={k} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="fm-sec">
        <h4>Number chip</h4>
        <Seg<string> label="Number chip" value={st.hideNum ? "hide" : "show"} options={[["show", "Show"], ["hide", "Hide"]]} onChange={(v) => S({ hideNum: v === "hide" ? true : undefined })} />
        <p className="help">The one number this block shows in the People and Money views.</p>
      </div>
    </>
  );
}

export function StylePanel({ n, ids }: { n: FunnelNode; ids?: string[] }) {
  return typeOf(n.type).cat !== "annot" ? <BlockStyle n={n} all={ids ?? [n.id]} /> : <AnnotStyle n={n} ids={ids} />;
}

function AnnotStyle({ n, ids }: { n: FunnelNode; ids?: string[] }) {
  const all = ids ?? [n.id];
  const st: NodeStyle = n.s ?? {};
  const S = (patch: Partial<NodeStyle>) => setNodeStyle(n.id, patch, all);
  const T = typeOf(n.type);
  const block = T.cat !== "annot";
  const isText = n.type === "label";
  const hasText = block || TEXT_TYPES.has(n.type);
  const [q, setQ] = useState("");
  const icons = (Object.keys(ICONS) as IconName[]).filter((k) => k.includes(q.trim().toLowerCase()));
  return (
    <>
      <StyleShortcuts ids={all} />
      {block && all.length === 1 && (
        <div className="fm-sec">
          <h4>Icon</h4>
          <div className="flex items-center gap-2">
            <input className="input" placeholder="Search icons" aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
            {st.icon && (
              <button type="button" className="btn sm ghost" onClick={() => S({ icon: undefined })}>
                Default
              </button>
            )}
          </div>
          <div className="fm-icongrid" role="group" aria-label="Icon">
            {icons.map((k) => (
              <button key={k} type="button" aria-pressed={(st.icon || T.icon) === k} aria-label={`Icon ${k}`} title={k} onClick={() => S({ icon: k === T.icon ? undefined : k })}>
                <Icon name={k} />
              </button>
            ))}
          </div>
        </div>
      )}

      {hasText && (
        <div className="fm-sec">
          <h4>Text</h4>
          <Field label="Font family">
            {(id) => (
              <select id={id} className="input" value={st.font ?? ""} onChange={(e) => S({ font: (e.target.value || undefined) as FontFamily | undefined })}>
                <option value="">Default</option>
                {(Object.keys(FONT_FAMILIES) as FontFamily[]).map((f) => (
                  <option key={f} value={f}>
                    {FONT_FAMILIES[f].label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="row2">
            {isText ? (
              <OptNum label="Font Size" value={Number(n.p.size) || 28} min={8} max={160} onChange={(v) => updateParams(n.id, { size: v ?? 28 })} placeholder="28" />
            ) : (
              <OptNum label="Font Size" value={st.fontSize} min={8} max={96} onChange={(v) => S({ fontSize: v })} />
            )}
            <OptNum label="Line height" value={st.lh} min={0.8} max={3} step={0.05} onChange={(v) => S({ lh: v })} />
          </div>
          <div className="field">
            <span className="lbl">Weight</span>
            <Seg<string> label="Weight" value={String(st.weight ?? "")} options={FONT_WEIGHTS.map(([w, l]) => [String(w), l])} onChange={(v) => S({ weight: st.weight === Number(v) ? undefined : Number(v) })} />
          </div>
          <div className="row2">
            <OptNum label="Letter spacing (px)" value={st.ls} min={-5} max={20} step={0.1} onChange={(v) => S({ ls: v })} placeholder="0" />
          </div>
          <div>
            <div className="field">
              <span className="lbl">Alignment</span>
              <Seg<string>
                label="Alignment"
                value={st.align ?? ""}
                options={[
                  ["left", "Left"],
                  ["center", "Centre"],
                  ["right", "Right"],
                ]}
                onChange={(v) => S({ align: st.align === v ? undefined : (v as NodeStyle["align"]) })}
              />
            </div>
          </div>
          <div className="field">
            <span className="lbl">Emphasis</span>
            <div className="flex gap-1.5">
              <Toggle label="Italic" on={!!st.italic} onChange={(v) => S({ italic: v || undefined })}>
                <i>I</i>
              </Toggle>
              <Toggle label="Underline" on={!!st.underline} onChange={(v) => S({ underline: v || undefined })}>
                <u>U</u>
              </Toggle>
              <Toggle label="Strikethrough" on={!!st.strike} onChange={(v) => S({ strike: v || undefined })}>
                <s>S</s>
              </Toggle>
            </div>
          </div>
          <ColorField label="Text colour" value={st.color} onChange={(v) => S({ color: v })} fallback="#e2e8f0" />
        </div>
      )}

      <div className="fm-sec">
        <h4>Appearance</h4>
        {n.type !== "image" && <ColorField label={n.type === "frame" ? "Background" : "Fill"} value={st.fill} onChange={(v) => S({ fill: v })} fallback="#1e293b" />}
        <ColorField label="Border colour" value={st.border} onChange={(v) => S({ border: v })} fallback="#334155" />
        <div className="row2">
          <OptNum label="Border width" value={st.borderW} min={0} max={12} onChange={(v) => S({ borderW: v })} />
          <Field label="Border style">
            {(id) => (
              <select id={id} className="input" value={st.borderStyle ?? ""} onChange={(e) => S({ borderStyle: (e.target.value || undefined) as NodeStyle["borderStyle"] })}>
                <option value="">Default</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            )}
          </Field>
        </div>
        <div className="row2">
          <OptNum label="Corner radius" value={st.radius} min={0} max={200} onChange={(v) => S({ radius: v })} />
          <OptNum label="Opacity (%)" value={st.opacity != null ? Math.round(st.opacity * 100) : undefined} min={10} max={100} onChange={(v) => S({ opacity: v == null || v >= 100 ? undefined : v / 100 })} placeholder="100" />
        </div>
        <div className="row2">
          <Field label="Shadow">
            {(id) => (
              <select id={id} className="input" value={st.shadow ?? ""} onChange={(e) => S({ shadow: (e.target.value || undefined) as NodeStyle["shadow"] })}>
                <option value="">Default</option>
                <option value="none">None</option>
                <option value="soft">Soft</option>
                <option value="strong">Strong</option>
              </select>
            )}
          </Field>
          {!block && n.type !== "image" && <OptNum label="Padding" value={st.pad} min={0} max={64} onChange={(v) => S({ pad: v })} />}
        </div>
        {n.s && (
          <button type="button" className="btn sm ghost" onClick={() => setNodeStyle(n.id, Object.fromEntries(Object.keys(n.s ?? {}).map((k) => [k, undefined])))}>
            Reset all styles
          </button>
        )}
      </div>

      <SizeFields n={n} />
    </>
  );
}

/** Element size + position (annotations have stored sizes; flow blocks keep the standard size). */
function SizeFields({ n }: { n: FunnelNode }) {
  const dims = useEditor((s) => s.dims[n.id]);
  const move = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (n.locked) return showToast("Locked: unlock it first to move or resize");
    moveNodes({ [n.id]: { x: n.x, y: n.y, ...patch } });
  };
  const sized = ["frame", "shape", "image"].includes(n.type);
  const widthOnly = ["label", "note", "checklist", "link"].includes(n.type);
  return (
    <div className="fm-sec">
      <h4>Size and position</h4>
      <div className="row2">
        <OptNum label="X" value={n.x} onChange={(v) => v != null && move({ x: Math.round(v) })} placeholder="0" />
        <OptNum label="Y" value={n.y} onChange={(v) => v != null && move({ y: Math.round(v) })} placeholder="0" />
      </div>
      {(sized || widthOnly) && (
        <div className="row2">
          <OptNum label="Width" value={n.w ?? dims?.width} min={40} max={4000} onChange={(v) => v != null && move({ w: Math.round(v) })} />
          {sized ? <OptNum label="Height" value={n.h ?? dims?.height} min={30} max={4000} onChange={(v) => v != null && move({ h: Math.round(v) })} /> : <p className="help self-end pb-3 text-xs text-muted">Height follows the content.</p>}
        </div>
      )}
      {!sized && !widthOnly && <p className="text-xs text-muted">Funnel blocks use the standard block size so Tidy up and exports stay aligned.</p>}
    </div>
  );
}

/* ---------------- checklists ---------------- */

export function ChecklistEditor({ n, label = "Checklist" }: { n: FunnelNode; label?: string }) {
  const items = checklistOf(n);
  const [draft, setDraft] = useState("");
  const put = (next: ChecklistItem[], discrete = true) => setChecklist(n.id, next, { discrete });
  const edit = (id: string, patch: Partial<ChecklistItem>, discrete = true) => put(items.map((i) => (i.id === id ? { ...i, ...patch } : i)), discrete);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    put(next);
  };
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    put([...items, newChecklistItem(t)]);
    setDraft("");
  };
  const done = items.filter((i) => i.done).length;
  return (
    <div className="field">
      <span className="lbl">
        {label} {items.length > 0 && <span className="font-normal text-muted">· {done} of {items.length} done</span>}
      </span>
      <ul className="fm-tlist" aria-label={label}>
        {items.map((it, i) => (
          <li key={it.id} style={{ paddingLeft: (it.indent ?? 0) * 14 }}>
            <input type="checkbox" checked={it.done} onChange={(e) => edit(it.id, { done: e.target.checked })} aria-label={`Done: ${it.text || "item"}`} />
            <input className="input" value={it.text} aria-label="Checklist item" onChange={(e) => edit(it.id, { text: e.target.value }, false)} />
            <button type="button" className="btn icon ghost" aria-label="Indent" title="Indent" onClick={() => edit(it.id, { indent: Math.min(3, (it.indent ?? 0) + 1) })}>
              →
            </button>
            <button type="button" className="btn icon ghost" aria-label="Outdent" title="Outdent" disabled={!it.indent} onClick={() => edit(it.id, { indent: Math.max(0, (it.indent ?? 0) - 1) || undefined })}>
              ←
            </button>
            <button type="button" className="btn icon ghost" aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button type="button" className="btn icon ghost" aria-label="Move down" title="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button type="button" className="btn icon ghost danger" aria-label="Remove item" title="Remove" onClick={() => put(items.filter((x) => x.id !== it.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className="input"
          value={draft}
          placeholder="Add an item…"
          aria-label="New checklist item"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

/* ---------------- images ---------------- */

const MAX_SIDE = 1200;
const MAX_BYTES = 25 * 1024 * 1024;

/** Scale an uploaded image down and keep it inside the funnel as a WebP data URL under 100 KB (V2 F7), so share links and exports can show it. */
async function imageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  if (file.size > MAX_BYTES) throw new Error("That image is over 25 MB");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Couldn’t read that image"));
      i.src = url;
    });
    const w = img.naturalWidth || 800,
      h = img.naturalHeight || 600;
    const src = Object.assign(img, { width: w, height: h });
    return encodeUnder(src, Math.min(MAX_SIDE, w));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImageFields({ n }: { n: FunnelNode }) {
  const src = String(n.p.src ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const isData = src.startsWith("data:");
  return (
    <>
      <Field label="Upload image" help="PNG, JPG, WebP, GIF or SVG. Stored as WebP under 100 KB, at most 1200 px wide.">
        {(id) => (
          <input
            id={id}
            className="input"
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setErr("");
              setBusy(true);
              try {
                updateParams(n.id, { src: await imageToDataUrl(f), alt: String(n.p.alt || f.name.replace(/\.[a-z0-9]+$/i, "")) });
              } catch (x) {
                setErr((x as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </Field>
      {err && (
        <p role="alert" className="mb-2 text-sm text-bad">
          {err}
        </p>
      )}
      <Field label="…or image URL">
        {(id) => <input id={id} className="input" type="url" placeholder="https://" value={isData ? "" : src} onChange={(e) => updateParams(n.id, { src: e.target.value.trim() })} />}
      </Field>
      <Field label="Description (alt text)">{(id) => <input id={id} className="input" value={String(n.p.alt ?? "")} onChange={(e) => updateParams(n.id, { alt: e.target.value })} />}</Field>
      <div className="field">
        <span className="lbl">Fit</span>
        <Seg<string>
          label="Fit"
          value={n.p.fit === "cover" ? "cover" : "contain"}
          options={[
            ["contain", "Show all"],
            ["cover", "Fill frame"],
          ]}
          onChange={(v) => updateParams(n.id, { fit: v })}
        />
      </div>
      {src && (
        <button type="button" className="btn sm ghost mb-3" onClick={() => updateParams(n.id, { src: "" })}>
          Remove image
        </button>
      )}
    </>
  );
}

/* ---------------- connection style ---------------- */

export function EdgeStyleFields({ e }: { e: FunnelEdge }) {
  const st: EdgeStyle = e.s ?? {};
  const S = (patch: Partial<EdgeStyle>) => setEdgeStyle(e.id, patch);
  return (
    <div className="fm-sec">
      <h4>Line style</h4>
      <div className="field">
        <span className="lbl">Kind of line</span>
        <div className="fm-chips" role="group" aria-label="Connection presets">
          {Object.entries(EDGE_PRESETS).map(([k, p]) => (
            <button key={k} type="button" className="chip" aria-pressed={st.preset === k} onClick={() => S(st.preset === k ? { preset: undefined, label: undefined, color: undefined, dash: undefined, arrow: undefined } : { preset: undefined, label: undefined, color: undefined, dash: undefined, arrow: undefined, ...p.style })}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="help">Presets set the label and look. Presentation only.</span>
      </div>
      <div className="field">
        <span className="lbl">Type</span>
        <Seg<string>
          label="Connection type"
          value={st.kind ?? "flow"}
          options={[
            ["flow", "Normal"],
            ["skip", "Skip step"],
            ["nodata", "No data"],
          ]}
          onChange={(v) => S({ kind: v === "flow" ? undefined : (v as EdgeStyle["kind"]) })}
        />
        <span className="help">Presentation only: the numbers on the path are calculated the same way.</span>
      </div>
      <div className="field">
        <span className="lbl">Path</span>
        <Seg<string>
          label="Path"
          value={st.path ?? "curve"}
          options={[
            ["curve", "Curved"],
            ["straight", "Straight"],
            ["elbow", "Elbow"],
          ]}
          onChange={(v) => S({ path: v === "curve" ? undefined : (v as EdgeStyle["path"]) })}
        />
      </div>
      <div className="field">
        <span className="lbl">Line</span>
        <Seg<string>
          label="Line"
          value={st.dash ?? ""}
          options={[
            ["solid", "Solid"],
            ["dashed", "Dashed"],
            ["dotted", "Dotted"],
          ]}
          onChange={(v) => S({ dash: st.dash === v ? undefined : (v as EdgeStyle["dash"]) })}
        />
      </div>
      <ColorField label="Line colour" value={st.color} onChange={(v) => S({ color: v })} fallback="#64748b" />
      <div className="row2">
        <OptNum label="Thickness" value={st.width} min={1} max={12} onChange={(v) => S({ width: v })} />
        <Field label="Label">
          {(id) => (
            <>
              <input id={id} className="input" list="fm-edge-labels" value={st.label ?? ""} placeholder="e.g. Retargeting" maxLength={40} onChange={(ev) => S({ label: ev.target.value || undefined })} />
              <datalist id="fm-edge-labels">
                {["Yes", "No", "Purchase", "No thanks", "Retargeting", "Upsell", "Downsell", "Follow-up", "Booked", "No-show"].map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </div>
      <OptNum label="Opacity (%)" value={st.opacity != null ? Math.round(st.opacity * 100) : undefined} min={10} max={100} placeholder="100" onChange={(v) => S({ opacity: v == null || v >= 100 ? undefined : v / 100 })} />
      <div className="field">
        <span className="lbl">Also show on the line</span>
        <label className="check">
          <input type="checkbox" checked={!!st.showPct} onChange={(ev) => S({ showPct: ev.target.checked || undefined })} /> Conversion % at the source step
        </label>
        <label className="check">
          <input type="checkbox" checked={!!st.showRev} onChange={(ev) => S({ showRev: ev.target.checked || undefined })} /> Revenue that flows through
        </label>
        <span className="help">People are always shown. Hidden in Clean map.</span>
      </div>
      <div className="field">
        <span className="lbl">Arrow</span>
        <Seg<string>
          label="Arrow"
          value={st.arrow ?? "none"}
          options={[
            ["none", "None"],
            ["end", "End"],
            ["both", "Both ends"],
          ]}
          onChange={(v) => S({ arrow: v === "none" ? undefined : (v as EdgeStyle["arrow"]) })}
        />
      </div>
      {st.arrow && (
        <div className="field">
          <span className="lbl">Arrow size</span>
          <Seg<string>
            label="Arrow size"
            value={st.arrowSize ?? "md"}
            options={[
              ["sm", "Small"],
              ["md", "Medium"],
              ["lg", "Large"],
            ]}
            onChange={(v) => S({ arrowSize: v === "md" ? undefined : (v as EdgeStyle["arrowSize"]) })}
          />
        </div>
      )}
      {e.s && (
        <button type="button" className="btn sm ghost mb-3" onClick={() => setEdgeStyle(e.id, Object.fromEntries(Object.keys(e.s ?? {}).map((k) => [k, undefined])))}>
          Reset line style
        </button>
      )}
    </div>
  );
}
