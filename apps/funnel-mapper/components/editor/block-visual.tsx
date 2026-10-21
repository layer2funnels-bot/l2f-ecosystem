"use client";
// Shared renderers for the block visual system (lib/block-visuals.ts). Used by the canvas card (nodes.tsx),
// the library tiles (palette.tsx) and Quick Add, so one block reads the same everywhere.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { useSignedUrl } from "@/components/signed-image";
import { CATCOLOR, typeOf } from "@/lib/catalog";
import type { StepStatus } from "@/lib/graph";
import type { IconName } from "@/lib/icons";
import { offerSubtitle, priceTab } from "@/lib/editor/labels";
import { brandMarkOf } from "@/lib/brand-marks";
import { placePeek } from "@/lib/peek-place";
import { hostOf, safeUrl } from "@/lib/rich-text";
import { selectNodes, setInspTab, useEditor } from "@/lib/editor/store";
import { artOf, artSrc } from "@/lib/block-art";
import { visualOf, WF_SIZE, WIREFRAMES, type WfPaint, type WfShape, type Wireframe } from "@/lib/block-visuals";

const PAINT: Record<WfPaint, { fill: string; stroke: string }> = {
  o: { fill: "none", stroke: "var(--line)" },
  d: { fill: "var(--line)", stroke: "none" },
  m: { fill: "var(--edge)", stroke: "none" },
  a: { fill: "var(--wfa)", stroke: "none" },
  ao: { fill: "none", stroke: "var(--wfa)" },
};

function Shape({ s }: { s: WfShape }) {
  if (s[0] === "r") return <rect x={s[1]} y={s[2]} width={s[3]} height={s[4]} rx={s[5]} {...PAINT[s[6]]} />;
  if (s[0] === "c") return <circle cx={s[1]} cy={s[2]} r={s[3]} {...PAINT[s[4]]} />;
  return <path d={s[1]} {...PAINT[s[2]]} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />;
}

/** The captured / uploaded page screenshot (private bucket, signed URL) drawn over the wireframe once it has loaded. */
export function PageShot({ path }: { path: string }) {
  // the block shows the whole page, fitted inside its picture (not the old cropped 208 x 256 file), so any upload or capture looks right
  const remote = /^https?:|^data:/.test(path);
  const url = useSignedUrl("screenshots", remote ? null : path);
  const src = remote ? path : url;
  const [bad, setBad] = useState(false);
  if (!src || bad) return null;
  // eslint-disable-next-line @next/next/no-img-element -- user screenshot
  return <img className="fm-shot" src={src} alt="" draggable={false} onError={() => setBad(true)} />;
}

/** Who the hover preview belongs to (the canvas card passes it; library tiles and the inspector don't). */
export interface PeekOwner {
  id: string;
  name: string;
  type: string;
  url?: string;
}

const PEEK = { w: 320, h: 392 },
  PEEK_COMPACT = { w: 240, h: 300 };

/**
 * Page hover preview (V2 F1): opens only from the page thumbnail, 400 ms after the pointer rests on it, and closes
 * 150 ms after it leaves (not when it moves onto the preview, so its buttons work). Placed below the block, then above,
 * right, left: the side covering the fewest blocks, never the hovered block or its ports (lib/peek-place.ts).
 * Screen-space, so it does not scale with the canvas zoom.
 */
function PagePeek({ path, owner, anchor, onEnter, onLeave, onClose }: { path: string; owner: PeekOwner; anchor: HTMLElement; onEnter: () => void; onLeave: () => void; onClose: () => void }) {
  const nodeEl = anchor.closest(".react-flow__node") as HTMLElement | null;
  const stage = (anchor.closest(".fm-stage") as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const b = (nodeEl ?? anchor).getBoundingClientRect();
  const others = [...document.querySelectorAll<HTMLElement>(".fm-stage .react-flow__node")]
    .filter((el) => el !== nodeEl && !el.classList.contains("react-flow__node-frame"))
    .map((el) => el.getBoundingClientRect())
    .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
  const place = placePeek({ x: b.left, y: b.top, w: b.width, h: b.height }, others, { x: stage.left, y: stage.top, w: stage.width, h: stage.height }, PEEK, 18, PEEK_COMPACT);
  const T = typeOf(owner.type);
  const url = owner.url?.trim();
  return createPortal(
    <div className={`fm-peek ${place.side}`} style={{ left: place.x, top: place.y, width: place.w, height: place.h }} role="dialog" aria-label={`Preview of ${owner.name}`} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div className="pk-head">
        <b>{owner.name}</b>
        <small>
          {T?.label ?? "Page"} · {url ? hostOf(url) : "uploaded screenshot"}
        </small>
      </div>
      <div className="pk-img">
        <PageShot path={path} />
      </div>
      <div className="pk-actions">
        {url && safeUrl(url) ? (
          <a className="btn sm" href={safeUrl(url)!} target="_blank" rel="noopener noreferrer nofollow">
            Open page ↗
          </a>
        ) : null}
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            onClose();
            selectNodes([owner.id]);
            setInspTab("details");
          }}
        >
          Preview settings
        </button>
        <small className="pk-esc">Esc to close</small>
      </div>
    </div>,
    document.body,
  );
}

/** Semantic page wireframe (preview strip). A saved capture replaces it; the wireframe stays whenever there is none (or it fails to load). */
export function WireframeStrip({ kind, accent, shot, owner, win, pic }: { kind: Wireframe; accent: string; shot?: string; owner?: PeekOwner; /** The design's browser window (inner SVG of a 66 × 65 page): replaces the old strip. */ win?: string; /** Fills a picture-first block (104 × 128): the capture, or the page drawing, fitted inside it. */ pic?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const openT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useRef(false);
  const can = !!shot && !!owner;
  const busy = () => {
    const s = useEditor.getState();
    return s.dragging || !!s.menu || !!s.quick || !!s.lineMenu || !!document.querySelector(".fm-stage.fm-connecting");
  };
  const open = (el: HTMLElement, delay = 400) => {
    clearTimeout(closeT.current);
    clearTimeout(openT.current);
    openT.current = setTimeout(() => !busy() && setAnchor(el), delay);
  };
  const close = (delay = 150) => {
    clearTimeout(openT.current);
    clearTimeout(closeT.current);
    closeT.current = setTimeout(() => setAnchor(null), delay);
  };
  useEffect(() => {
    if (!anchor) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setAnchor(null);
    // panning or zooming moves the block away from the preview: close it
    const off = useEditor.subscribe((s, p) => (s.view !== p.view || s.dragging) && setAnchor(null));
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      off();
    };
  }, [anchor]);
  useEffect(() => () => (clearTimeout(openT.current), clearTimeout(closeT.current)), []);
  // touch: a long press on the window opens the preview instead of the block menu
  useEffect(() => {
    const el = ref.current;
    if (!el || !can) return;
    const ctx = (e: Event) => {
      if (!touch.current) return;
      e.preventDefault();
      e.stopPropagation();
      setAnchor(el);
    };
    el.addEventListener("contextmenu", ctx);
    return () => el.removeEventListener("contextmenu", ctx);
  }, [can]);
  return (
    <div
      ref={ref}
      className={`${pic ? "fm-picwin" : win ? "pgo-win" : "fm-wf"}${shot ? " has-shot" : ""}`}
      style={{ ["--wfa" as string]: accent }}
      aria-hidden={can ? undefined : true}
      tabIndex={can ? 0 : undefined}
      role={can ? "button" : undefined}
      aria-label={can ? `Page preview of ${owner!.name}` : undefined}
      onPointerDown={(e) => (touch.current = e.pointerType === "touch")}
      onPointerEnter={can ? (e) => e.pointerType === "mouse" && open(e.currentTarget) : undefined}
      onPointerLeave={can ? () => close() : undefined}
      onFocus={can ? (e) => e.currentTarget.matches(":focus-visible") && open(e.currentTarget, 0) : undefined}
      onBlur={can ? () => close(0) : undefined}
    >
      {pic ? (
        <>
          {win && <svg viewBox="0 0 66 65" preserveAspectRatio="xMidYMin slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: win }} />}
          {shot && <PageShot path={shot} />}
        </>
      ) : win ? (
        <>
          <span className="pgo-chrome" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="pgo-page">
            <svg width="66" height="65" viewBox="0 0 66 65" preserveAspectRatio="xMidYMid slice" aria-hidden="true" dangerouslySetInnerHTML={{ __html: win }} />
            {shot && <PageShot path={shot} />}
          </span>
        </>
      ) : (
        <>
          {shot && <PageShot path={shot} />}
          <svg viewBox={`0 0 ${WF_SIZE.w} ${WF_SIZE.h}`} preserveAspectRatio="xMidYMid meet" strokeWidth={1}>
            {WIREFRAMES[kind].map((s, i) => (
              <Shape key={i} s={s} />
            ))}
          </svg>
        </>
      )}
      {shot && owner && anchor && <PagePeek path={shot} owner={owner} anchor={anchor} onEnter={() => clearTimeout(closeT.current)} onLeave={() => close()} onClose={() => setAnchor(null)} />}
    </div>
  );
}

const STATUS_LABEL: Record<StepStatus, string> = { planned: "Planned", building: "In progress", done: "Live" };

/** Build-status dot in the card's top-right corner. */
export function StatusDot({ status }: { status: StepStatus | undefined }) {
  const s = status ?? "planned";
  return <span className={`fm-st ${s}`} title={STATUS_LABEL[s]} role="img" aria-label={`Status: ${STATUS_LABEL[s]}`} />;
}

/** Yes/No or A/B share bar for logic blocks (the second share is "people lost" for Yes/No logic, neutral for tests). */
export function SplitBar({ pct, test }: { pct: number; test: boolean }) {
  const a = Math.max(0, Math.min(100, pct));
  return (
    <div className={`fm-split${test ? " test" : ""}`} aria-hidden="true">
      <i style={{ width: `${a}%` }} />
      <i style={{ width: `${100 - a}%` }} />
    </div>
  );
}

/** Platform mark for a block that stands for one platform (null for any other block). */
export function BrandGlyph({ type, size = 18 }: { type: string; size?: number }) {
  const d = brandMarkOf(type);
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor" className="fm-bmark">
      <path d={d} />
    </svg>
  );
}

/** The owner's artwork for a block (public/blocks): it IS the tile (shape and colour included). */
export function BlockArtImg({ k }: { k: string }) {
  const a = artOf(k);
  if (!a) return null;
  // eslint-disable-next-line @next/next/no-img-element -- static block artwork, tiny WebP
  return <img className={`fm-art ${a.shape}`} src={artSrc(a)} alt="" draggable={false} loading="lazy" decoding="async" />;
}

/** Library / Quick Add tile for a block, in the shape of its family. `artKey` is the library key (presets have their own artwork). */
export function BlockTile({ type, icon, size = 16, artKey }: { type: string; icon: IconName; size?: number; artKey?: string }) {
  const v = visualOf(type),
    T = typeOf(type);
  const ak = artKey ?? type;
  if (artOf(ak)) {
    return (
      <span className="pi art" aria-hidden="true">
        <BlockArtImg k={ak} />
      </span>
    );
  }
  const bg = v.brand ?? CATCOLOR[T?.color ?? T?.cat ?? "annot"];
  return (
    <span className={`pi fam-${v.family}${v.brand ? " brand" : ""}`} style={{ background: bg }}>
      {brandMarkOf(type) ? <BrandGlyph type={type} size={size} /> : <Icon name={icon} size={size} />}
    </span>
  );
}

export { offerSubtitle, priceTab };
