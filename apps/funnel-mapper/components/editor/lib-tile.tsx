// A library block drawn exactly as in the approved design (reference "Library-169" / "Blocks-sidebar"): the owner's artwork
// where there is one, the browser-window tile for pages and offers, the system tile for Communities, AI Calling and AI
// Automation, and the family tile for anything else. `size` is the design's 44px tile; every part scales with it.
import { BLOCK_ART } from "@/lib/block-art";
import { brandMarkOf } from "@/lib/brand-marks";
import { SYS_TILES, WIDGET_TILES, WINDOWS, type SysTile } from "@/lib/design-tiles";
import type { IconName } from "@/lib/icons";
import { BlockTile } from "./block-visual";

const artSrc = (file: string) => `/blocks/${file}`;

function Sys({ t, size }: { t: SysTile; size: number }) {
  const widget = t.shape === "sq" && !t.bg;
  return (
    <span className={`fm-sys ${t.shape}${widget ? " wdg" : ""}`} style={{ width: size, height: size, ...(t.bg ? { background: t.bg } : {}) }} aria-hidden="true">
      <span className="gl" style={t.shape === "d" ? { transform: "rotate(-45deg)" } : undefined}>
        <svg width={size * 0.43} height={size * 0.43} viewBox="0 0 24 24" fill="none" dangerouslySetInnerHTML={{ __html: t.svg }} {...attrsOf(t.attrs)} />
      </span>
    </span>
  );
}

/** "viewBox=\"0 0 24 24\" fill=\"none\" stroke=..." → props (the generated data keeps the design's own attributes). */
function attrsOf(a: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const m of a.matchAll(/([\w-]+)="([^"]*)"/g)) o[m[1].replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = m[2];
  delete o.viewBox;
  return o;
}

/** Browser-window tile: 3 dots on a chrome bar over the page wireframe (66 × 65). */
export function WindowTile({ inner, size }: { inner: string; size: number }) {
  return (
    <span className="fm-mw" style={{ width: Math.round(size * 1.045) }} aria-hidden="true">
      <span className="fm-mwc">
        <i />
        <i />
        <i />
      </span>
      <svg width={size} height={Math.round(size * 0.98)} viewBox="0 0 66 65" preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: inner }} />
    </span>
  );
}

export function LibTile({ k, type, icon, size = 44, widget }: { k: string; type: string; icon: IconName; size?: number; widget?: string }) {
  const w = widget ? WIDGET_TILES[widget] : undefined;
  if (w) return <Sys t={w} size={size} />;
  const art = BLOCK_ART[k];
  if (art?.glyph) {
    // TikTok, X, Threads: the owner's file is a 30px glyph with no tile, so the mark is drawn as a vector in a clean black disc
    const mark = brandMarkOf(k);
    return (
      <span className="fm-sys c" style={{ width: size, height: size, background: "#0b0b0f" }} aria-hidden="true">
        <span className="gl">
          {mark ? (
            <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="#fff">
              <path d={mark} />
            </svg>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- static block artwork
            <img src={artSrc(art.file)} width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} alt="" draggable={false} />
          )}
        </span>
      </span>
    );
  }
  if (art) {
    const px = art.shape === "diamond" ? Math.round(size * (54 / 44)) : size;
    // eslint-disable-next-line @next/next/no-img-element -- static block artwork
    return <img className={`fm-uic ${art.shape}`} src={artSrc(art.file)} width={px} height={px} alt="" draggable={false} loading="lazy" decoding="async" />;
  }
  if (WINDOWS[k]) return <WindowTile inner={WINDOWS[k]} size={size} />;
  if (SYS_TILES[k]) return <Sys t={SYS_TILES[k]} size={size} />;
  return <BlockTile type={type} icon={icon} size={Math.round(size * 0.4)} artKey={k} />;
}
