"use client";
import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { Icon } from "@/components/icon";
import { CATCOLOR, fourPorts, PIC, portsFor, typeOf } from "@/lib/catalog";
import { typeCaption, visualOf, windowKeyOf } from "@/lib/block-visuals";
import { WINDOWS } from "@/lib/design-tiles";
import { brandMarkOf } from "@/lib/brand-marks";
import { assumptionChanges, lostDots, stepDelta } from "@/lib/simulate";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { SimChip } from "./simulate";
import { BlockArtImg, BrandGlyph, StatusDot, WireframeStrip } from "./block-visual";
import { artOf } from "@/lib/block-art";
import type { ChecklistItem, FunnelNode } from "@/lib/graph";
import type { IconName } from "@/lib/icons";
import { checklistOf, moveNodes, openSettingsBox, setChecklist, shownR, startRename, updateNode, useEditor, viewK } from "@/lib/editor/store";
import { blockChip, perfLine, priceTab } from "@/lib/editor/labels";
import { nf, people as ppl, peopleExact } from "@/lib/format";
import { waitLabel, waitValid } from "@/lib/wait";
import { boxCss, shapeGeom, textCss } from "@/lib/style";
import { hostOf, isVideoUrl } from "@/lib/rich-text";
import { RichText } from "@/components/rich-text";
import { WidgetNode } from "./widget-node";
import { saveActual } from "./actuals-host";

type P = NodeProps & { data: { id: string } };

const useNode = (id: string) => useEditor((s) => s.nodes.find((n) => n.id === id));
const useEditable = (n: FunnelNode | undefined) => useEditor((s) => !s.readOnly && !!n && !n.locked);

function LockBadge({ n }: { n: FunnelNode }) {
  if (!n.locked) return null;
  return (
    <span className="fm-lock" title="Locked" aria-hidden="true">
      <Icon name="lock" size={12} />
    </span>
  );
}

/** Full resize handles (shapes, images, frames). */
function Resizer({ n, selected, minW = 40, minH = 30 }: { n: FunnelNode; selected: boolean; minW?: number; minH?: number }) {
  const editable = useEditable(n);
  return (
    <NodeResizer
      isVisible={selected && editable}
      minWidth={minW}
      minHeight={minH}
      lineStyle={{ borderColor: "transparent" }}
      onResizeEnd={(_, p) => moveNodes({ [n.id]: { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) } }, { discrete: true })}
    />
  );
}

/** Width-only handle (text, notes, checklists: their height follows the content). */
function WidthResizer({ n, selected, minW = 80 }: { n: FunnelNode; selected: boolean; minW?: number }) {
  const editable = useEditable(n);
  if (!selected || !editable) return null;
  return (
    <NodeResizeControl
      position="right"
      variant={ResizeControlVariant.Line}
      minWidth={minW}
      style={{ borderColor: "transparent", borderWidth: 6 }}
      onResizeEnd={(_, p) => moveNodes({ [n.id]: { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width) } }, { discrete: true })}
    />
  );
}

/** Zoom-dependent detail: far = icon + short name; mid = name + type; near = key numbers too. */
export const zoomBand = (k: number): "far" | "mid" | "near" => (k < 0.4 ? "far" : k <= 0.75 ? "mid" : "near");

function RenameInput({ id, value }: { id: string; value: string }) {
  const [v, setV] = useState(value);
  const done = (save: boolean) => {
    if (save && v.trim() && v !== value) updateNode(id, { name: v.trim() });
    startRename(null);
  };
  return (
    <input
      className="fm-rename nodrag nopan"
      autoFocus
      aria-label="Block name"
      value={v}
      maxLength={120}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

/** Actual mode: click the number chip, type the real number, Enter saves, Esc cancels. No panel opens. */
function ChipEdit({ n, view, onClose }: { n: FunnelNode; view: "clean" | "people" | "money"; onClose: () => void }) {
  const range = useEditor((s) => s.actualView);
  const rows = useEditor((s) => s.actuals);
  const T = typeOf(n.type);
  const money = view === "money";
  const field: "visitors" | "revenue" | "spend" = money ? (T.cat === "offer" ? "revenue" : "spend") : "visitors";
  const label = money ? (T.cat === "offer" ? "Revenue" : "Spend") : T.cat === "traffic" ? "Visits" : "People in";
  const mine = rows?.find((x) => x.node_id === n.id && range && x.period_start === range.start && x.period_end === range.end);
  const [v, setV] = useState(mine?.[field] != null ? String(mine[field]) : "");
  const [busy, setBusy] = useState(false);
  if (!range || (money && T.cat !== "offer" && T.cat !== "traffic")) return null;
  const save = async () => {
    setBusy(true);
    const num = v.trim() === "" ? null : Number(v);
    const ok = await saveActual(n.id, range, { visitors: mine?.visitors ?? null, conversions: mine?.conversions ?? null, revenue: mine?.revenue ?? null, spend: mine?.spend ?? null, [field]: Number.isFinite(num) ? num : null });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <div className="fm-chipedit nodrag nopan" role="dialog" aria-label={`Real number for ${n.name}`} onKeyDown={(e) => e.stopPropagation()}>
      <label>
        {label} · {range.label}
        <input
          autoFocus
          inputMode="decimal"
          value={v}
          disabled={busy}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") onClose();
          }}
        />
      </label>
      <div>
        <small>
          <kbd>Enter</kbd> save
        </small>
        <button
          type="button"
          onClick={() => {
            onClose();
            openSettingsBox(n.id);
          }}
        >
          Open settings ›
        </button>
      </div>
    </div>
  );
}

/** Progress of the goal attached to a goal block (target comes from Plan / Reports goals, never invented). */
export const BlockNode = memo(function BlockNode({ id, selected }: P) {
  const n = useNode(id);
  const R = useEditor(shownR);
  const cur = useEditor((s) => s.settings.currency);
  const basis = useEditor((s) => s.settings.basis);
  const warn = useEditor((s) => !s.shared && s.warnIds.has(id));
  // the view decides the one number a block shows; "Clean" and a client link without numbers show none
  const view = useEditor((s) => (s.settings.hideNumbers ? "clean" : s.opts.view));
  const perf = view !== "clean";
  // Biggest leak: a dashed ring and a chip above-left (no number); the people lost are on the leak line, once
  const leak = useEditor((s) => s.keyLeak === id && s.opts.view !== "clean" && !s.settings.hideNumbers);
  const lostHere = useEditor((s) => (s.keyLeak === id && s.opts.view !== "clean" && !s.settings.hideNumbers && !s.edges.some((e) => e.from === id && e.port === "alt") ? (s.R.N[id]?.non ?? 0) * viewK(s.opts) : 0));
  // the picture-first block shows less at a distance: far = shapes and lines, mid = names, near = number chips and subtype
  const band = useEditor((s) => (s.view.k < 0.22 ? "far" : s.view.k < 0.3 ? "mid" : "near"));
  const actualOn = useEditor((s) => !!s.actualView);
  const canEnter = useEditor((s) => !!s.actualView && !s.readOnly && !s.shared && !(s.nodes.find((x) => x.id === id)?.locked));
  const [chipOpen, setChipOpen] = useState(false);
  const renaming = useEditor((s) => s.renaming === id);
  const multi = useEditor((s) => s.selNodes.length > 1 && s.selNodes.includes(id));
  const spot = useEditor((s) => s.spot);
  const outOfStage = useEditor((s) => !!s.stageIds && !s.stageIds.includes(id));
  const k = useEditor((s) => viewK(s.opts));
  const build = useEditor((s) => s.opts.build); // the optional build-status layer
  const shared = useEditor((s) => s.shared);
  const simBase = useEditor((s) => s.simBase);
  const cmp = useEditor((s) => s.simBase ?? s.compareBase); // what the changes are measured against: the simulation start, or Baseline while Compare is on
  const simBefore = useEditor((s) => s.simBefore);
  const playing = useEditor((s) => s.simPlay && !!s.simBase);
  const altWired = useEditor((s) => s.edges.some((e) => e.from === id && e.port === "alt"));
  const calm = useReducedMotion();
  if (!n) return null;
  const T = typeOf(n.type);
  const { hasIn, hasOut, hasAlt, labels } = portsFor(n.type);
  const four = fourPorts(n.type);
  const logic = T.cat === "logic";
  const cc = n.s?.accent && /^#[0-9a-f]{6}$/i.test(n.s.accent) ? n.s.accent : CATCOLOR[T.color ?? T.cat];
  const V = visualOf(n.type);
  const chip = n.s?.hideNum ? null : blockChip(n, R, cur, k, view, basis);
  const pl = perf ? perfLine(n, R, cur, k, basis) : null;
  const nodata = !R.N[n.id] || (T.cat !== "traffic" && R.N[n.id].inflow === 0);
  // Simulate: how this step moved against the baseline (only while simulating, and not in a presentation)
  const sd = cmp && perf && !spot && !outOfStage && !shared && !simBefore ? stepDelta(n, R, cmp.R) : null;
  // the assumptions changed on this block while simulating (amber Δ with "was → now" on hover)
  const baseNode = simBase ? simBase.nodes.find((b) => b.id === id) : undefined;
  const changed = baseNode && !simBefore ? assumptionChanges([n], [baseNode]) : [];
  const tone = sd?.changed ? (sd.dRev ? (sd.dRev > 0 ? "up" : "down") : sd.dOut ? (sd.dOut > 0 ? "up" : "down") : null) : null;
  const invalid = n.type === "wait" && !waitValid(n.p);
  const internal = !shared && !!n.desc?.trim();
  const tasks = n.checklist ?? [];
  const cls = ["fm-blk", `fam-${V.family}`, `zb-${band}`, logic && "logic", V.brand && "brand", selected && "sel", selected && multi && "multi", warn && "warn", invalid && "err", leak && "leak", perf && pl && "perf", tone && `sim-${tone}`, n.locked && "locked", n.status === "done" && "live", (spot ? (spot === id ? "spot" : "dim") : outOfStage ? "dim" : false)].filter(Boolean).join(" ");
  const fam = V.family;
  const P = PIC[fam];
  const isPage = fam === "page" || fam === "offer";
  const art = !!artOf(n.type) && !n.s?.icon;
  const glyph = art ? <BlockArtImg k={n.type} /> : brandMarkOf(n.type) && !n.s?.icon ? <BrandGlyph type={n.type} size={fam === "source" ? 30 : 22} /> : <Icon name={(n.s?.icon as IconName) || T.icon} size={isPage ? 12 : fam === "source" ? 28 : 22} />;
  const chipText = chip ? chip.value : null;
  const emptyActual = !!actualOn && !chip && !n.s?.hideNum && perf;
  const ribbon = fam === "offer" && view !== "clean" ? priceTab(n, cur) : null;
  const showName = band !== "far";
  const showMore = band === "near";
  // a Wait's duration is an input it shows under its name (not in Clean, which carries no numbers)
  const subtype = n.type === "wait" && view !== "clean" ? waitLabel(n.p) : fam === "page" || fam === "offer" ? typeCaption(n.type) : T.label;
  return (
    <div className={cls} style={{ ["--cc" as string]: cc, ...(V.brand ? { ["--tile" as string]: V.brand } : null) }} aria-label={`${T.label}: ${n.name}`} title={!showName || n.name.length > 22 ? n.name : undefined}>
      <div className="fm-pic" data-fam={fam} style={{ width: P.w, height: P.h }}>
        {four ? (
          // four identical ports (hidden at rest; shown on hover, selection and while connecting). The line's meaning is chosen on the line.
          <>
            <Handle type="source" position={Position.Top} id="top" className="fm-port side top" title="Drag to connect" />
            <Handle type="source" position={Position.Right} id="right" className="fm-port side right" title="Drag to connect" />
            <Handle type="source" position={Position.Bottom} id="bottom" className="fm-port side bottom" title={hasAlt ? "Drag to connect (from here: people who leave)" : "Drag to connect"} />
            <Handle type="source" position={Position.Left} id="left" className="fm-port side left" title="Drag to connect" />
          </>
        ) : (
          hasIn && <Handle type="target" position={Position.Left} id="in" className="fm-port in" />
        )}
        {!four && hasOut && <Handle type="source" position={Position.Right} id="main" className="fm-port out" title={`${labels ? labels[0] : "Converted"}: drag to connect`} />}
        {!four && hasAlt && <Handle type="source" position={Position.Bottom} id="alt" className="fm-port alt" title={`${labels ? labels[1] : "Didn’t convert"}: drag to connect`} />}
        {isPage ? (
          <div className="fm-pbody" style={{ ["--cc" as string]: cc }}>
            <WireframeStrip pic kind={V.wireframe!} accent={cc} win={WINDOWS[windowKeyOf(n.type)]} shot={shared ? undefined : n.shot} owner={{ id: n.id, name: n.name, type: n.type, url: n.url }} />
            <span className="fm-pglyph" aria-hidden="true">
              <Icon name={(n.s?.icon as IconName) || T.icon} size={12} />
            </span>
            <i className="fm-pbar" aria-hidden="true" />
            {ribbon && <span className="fm-ribbon">{ribbon}</span>}
          </div>
        ) : (
          <div className={`fm-form${art ? " art" : ""}`} aria-hidden="true">
            {glyph}
          </div>
        )}
        {showMore && !warn && chipText && (actualOn && canEnter ? (
          <button type="button" className="fm-bchip edit nodrag nopan" title={`${chip?.title}. Click to type the real number`} aria-label={`${chip?.value} ${chip?.unit}. Edit the real number`.trim()} aria-expanded={chipOpen} onClick={() => setChipOpen((o) => !o)}>
            {chipText}
          </button>
        ) : (
          <span className="fm-bchip" title={chip?.title} aria-label={`${chip?.value} ${chip?.unit}`.trim()}>
            {chipText}
          </span>
        ))}
        {showMore && !warn && !chipText && emptyActual && (canEnter ? (
          <button type="button" className="fm-bchip empty edit nodrag nopan" title="No real numbers entered for these dates. Click to type one" aria-label="No real numbers entered. Type one" aria-expanded={chipOpen} onClick={() => setChipOpen((o) => !o)}>
            —
          </button>
        ) : (
          <span className="fm-bchip empty" title="No real numbers entered for these dates" aria-label="No real numbers entered">
            —
          </span>
        ))}
        {chipOpen && canEnter && <ChipEdit n={n} view={view} onClose={() => setChipOpen(false)} />}
        {warn && (
          <span className="fm-bchip warn" title="Needs a fix: see Checks" aria-label="Needs a fix">
            !
          </span>
        )}
        {n.locked && (
          <span className="fm-lock" title="Locked" aria-hidden="true">
            <Icon name="lock" size={11} />
          </span>
        )}
        {changed.length > 0 && (
          <span className="fm-delta" title={changed.map((c) => `${c.label} ${nf(c.was, 2)} → ${nf(c.now, 2)}`).join(" · ")} role="img" aria-label={`Changed in this simulation: ${changed.map((c) => `${c.label} ${nf(c.was, 2)} to ${nf(c.now, 2)}`).join(", ")}`}>
            Δ
          </span>
        )}
        {leak && (
          <span className="fm-leak" title="Biggest leak: the step that loses the most people">
            Biggest leak
          </span>
        )}
        {playing && !calm && perf && T.cat !== "traffic" && !altWired && !nodata && (
          <span className="fm-lostfx" aria-hidden="true">
            {Array.from({ length: lostDots(R.N[n.id]?.non ?? 0, R.N[n.id]?.inflow ?? 0) }, (_, j) => (
              <i key={j} style={{ animationDelay: `${j * 0.45}s` }} />
            ))}
          </span>
        )}
      </div>
      {showName && (
        <div className="fm-ntitle">
          {renaming ? <RenameInput id={n.id} value={n.name} /> : <span>{n.name}</span>}
          {showMore && <small>{subtype}</small>}
          {(internal || tasks.length > 0 || (!shared && build)) && (
            <span className="fm-nbadges">
              {!shared && build && <StatusDot status={n.status} />}
              {internal && (
                <span className="fm-nnote" title="Has internal notes (Notes tab)">
                  <Icon name="note" size={11} />
                </span>
              )}
              {tasks.length > 0 && (
                <span className="fm-ntasks" title="Checklist">
                  ✓ {tasks.filter((t) => t.done).length}/{tasks.length}
                </span>
              )}
            </span>
          )}
        </div>
      )}
      {lostHere >= 0.5 && (
        <span className="fm-leakstub" title={`${peopleExact(lostHere)} people leave here`}>
          <i aria-hidden="true" />
          <b>−{ppl(lostHere)}</b>
        </span>
      )}
      {sd && <SimChip d={sd} k={k} cur={cur} source={T.cat === "traffic"} />}
    </div>
  );
});

export const NoteNode = memo(function NoteNode({ id, selected }: P) {
  const n = useNode(id);
  if (!n) return null;
  return (
    <>
      <WidthResizer n={n} selected={selected} minW={120} />
      <div className={`fm-node note${selected ? " sel" : ""}`} style={{ ...(n.w ? { width: n.w } : {}), ...boxCss(n.s) }} aria-label="Sticky note">
        <LockBadge n={n} />
        <RichText className="ntext rich" style={textCss(n.s)} text={String(n.p.text ?? "")} />
      </div>
    </>
  );
});

export const LabelNode = memo(function LabelNode({ id, selected }: P) {
  const n = useNode(id);
  if (!n) return null;
  return (
    <>
      <WidthResizer n={n} selected={selected} />
      <div className={`fm-node label${selected ? " sel" : ""}${n.w ? " fixed" : ""}`} style={{ ...(n.w ? { width: n.w } : {}), ...boxCss(n.s) }} aria-label="Heading">
        <LockBadge n={n} />
        <div className="ntext" style={textCss(n.s, Number(n.p.size) || 28)}>
          {String(n.p.text ?? "")}
        </div>
      </div>
    </>
  );
});

export const FrameNode = memo(function FrameNode({ id, selected }: P) {
  const n = useNode(id);
  if (!n) return null;
  return (
    <>
      <Resizer n={n} selected={selected} minW={160} minH={100} />
      <div className={`fm-frame${selected ? " sel" : ""}`} style={{ ["--fc" as string]: String(n.p.color ?? "#10B981"), ...boxCss(n.s) }} aria-label={`Stage frame: ${n.name}`}>
        <LockBadge n={n} />
        <span className="ftitle" style={textCss(n.s)}>
          {n.name}
        </span>
      </div>
    </>
  );
});

export const ShapeNode = memo(function ShapeNode({ id, selected }: P) {
  const n = useNode(id);
  if (!n) return null;
  const shape = String(n.p.shape ?? "rounded");
  const s = n.s ?? {};
  const text = String(n.p.text ?? "");
  const box = boxCss(s);
  const w = n.w ?? 200,
    h = n.h ?? 120;
  const geom = shapeGeom(shape, w, h, String(n.p.dir ?? "h"), s.borderW ?? 2);
  const drawn = shape === "diamond" || !!geom;
  const dash = s.borderStyle === "dashed" ? "6 4" : s.borderStyle === "dotted" ? "1.5 3" : undefined;
  return (
    <>
      <Resizer n={n} selected={selected} minW={geom?.open ? 16 : 40} minH={geom?.open ? 12 : 30} />
      <div className={`fm-shape ${shape}${selected ? " sel" : ""}`} style={drawn ? { opacity: box.opacity, boxShadow: undefined } : box} aria-label={`Shape: ${text || shape}`}>
        {geom && (
          <svg className="fm-diamond" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
            <path
              d={geom.d}
              className={geom.open ? "open" : undefined}
              style={{ fill: geom.open ? "none" : s.fill, stroke: s.border, strokeWidth: s.borderW ?? (geom.open ? 2 : 1.5), strokeDasharray: dash }}
              vectorEffect="non-scaling-stroke"
            />
            {geom.head && <polygon points={geom.head} className="head" style={{ fill: s.border }} />}
          </svg>
        )}
        {shape === "diamond" && (
          <svg className="fm-diamond" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points="50,1 99,50 50,99 1,50" style={{ fill: s.fill, stroke: s.border, strokeWidth: s.borderW ?? 1.5, strokeDasharray: s.borderStyle === "dashed" ? "6 4" : s.borderStyle === "dotted" ? "1.5 3" : undefined }} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <LockBadge n={n} />
        {text && !geom?.open && (
          <div className="stext" style={{ ...textCss(s), ...(shape === "callout" ? { marginBottom: h * 0.22 } : {}) }}>
            {text}
          </div>
        )}
      </div>
    </>
  );
});

export const ImageNode = memo(function ImageNode({ id, selected }: P) {
  const n = useNode(id);
  if (!n) return null;
  const src = String(n.p.src ?? "");
  return (
    <>
      <Resizer n={n} selected={selected} minW={40} minH={40} />
      <div className={`fm-image${selected ? " sel" : ""}${src ? "" : " empty"}`} style={boxCss(n.s)}>
        <LockBadge n={n} />
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- user images (data/remote URLs) on the canvas
          <img src={src} alt={String(n.p.alt ?? "")} draggable={false} style={{ objectFit: n.p.fit === "cover" ? "cover" : "contain" }} />
        ) : (
          <span className="ph">
            <Icon name="image" />
            Add an image in the inspector
          </span>
        )}
      </div>
    </>
  );
});

export const ChecklistNode = memo(function ChecklistNode({ id, selected }: P) {
  const n = useNode(id);
  const ro = useEditor((s) => s.readOnly);
  if (!n) return null;
  const items = checklistOf(n);
  const done = items.filter((i) => i.done).length;
  const toggle = (it: ChecklistItem) => setChecklist(n.id, items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)), { discrete: true });
  return (
    <>
      <WidthResizer n={n} selected={selected} minW={160} />
      <div className={`fm-node checklist${selected ? " sel" : ""}`} style={{ ...(n.w ? { width: n.w } : {}), ...boxCss(n.s) }} aria-label={`Checklist: ${String(n.p.title ?? "")}`}>
        <LockBadge n={n} />
        <div className="ctitle" style={textCss(n.s)}>
          {String(n.p.title ?? "Checklist")}
          <small>
            {done}/{items.length}
          </small>
        </div>
        <ul>
          {items.map((it) => (
            <li key={it.id} style={{ paddingLeft: (it.indent ?? 0) * 16 }}>
              <label className="nodrag">
                <input type="checkbox" checked={it.done} disabled={ro} onChange={() => toggle(it)} aria-label={it.text || "Checklist item"} />
                <span className={it.done ? "done" : ""} style={textCss(n.s)}>
                  {it.text}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
});

export const LinkNode = memo(function LinkNode({ id, selected }: P) {
  const n = useNode(id);
  if (!n) return null;
  const url = String(n.p.url ?? "");
  const video = url && isVideoUrl(url);
  const title = String(n.p.title ?? "") || (url ? hostOf(url) : "Add a link in the inspector");
  return (
    <>
      <WidthResizer n={n} selected={selected} minW={180} />
      <div className={`fm-node linkcard${selected ? " sel" : ""}`} style={{ ...(n.w ? { width: n.w } : {}), ...boxCss(n.s) }} aria-label={`${video ? "Video" : "Link"}: ${title}`}>
        <LockBadge n={n} />
        <span className={`lthumb${video ? " video" : ""}`} aria-hidden="true">
          <Icon name={video ? "play" : "link"} size={18} />
        </span>
        <span className="lbody">
          <b style={textCss(n.s)}>{title}</b>
          {url ? (
            <a className="nodrag" href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
              {hostOf(url)} ↗
            </a>
          ) : (
            <small>No link yet</small>
          )}
        </span>
      </div>
    </>
  );
});

export const nodeTypes = { widget: WidgetNode, block: BlockNode, note: NoteNode, label: LabelNode, frame: FrameNode, shape: ShapeNode, image: ImageNode, checklist: ChecklistNode, link: LinkNode };
