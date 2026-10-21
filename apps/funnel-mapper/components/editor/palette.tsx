"use client";
// Blocks sidebar (V2, reference "Blocks-sidebar"): title and collapse, search with "/", Recent (and Pinned) as icon tiles,
// this client's products, then ONE accordion of the approved categories with computed counts (one open at a time, nine
// tiles before "Show all N"), and Widgets as the last section. Click places a block in view, drag places it where it is
// dropped. Everything renders from the library registry (lib/library.ts); tiles are the design's own (lib-tile.tsx).
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icon";
import { baseOf, LIB_GROUPS, typeOf, type LibGroup, type NodeParams } from "@/lib/catalog";
import type { IconName } from "@/lib/icons";
import { money } from "@/lib/format";
import { addNode, useEditor } from "@/lib/editor/store";
import { FAV_KEY, markUsed, RECENT_KEY, toggleFav as toggleFavKey, useList } from "./library-lists";
import { DND_MIME } from "./canvas";
import { LibTile } from "./lib-tile";
import { BY_KEY, groupCounts, ITEMS, searchLibrary, type LibItem, type LibPayload } from "@/lib/library";
import { WIDGET_PRESETS } from "@/lib/widget-presets";

export interface PaletteProduct {
  id: string;
  name: string;
  type: string;
  params: NodeParams;
}

export { ITEMS };
export type { LibItem, LibPayload };

/** Small random offset so blocks added by tap don't stack exactly on top of each other. */
const jitter = () => Math.random() * 80 - 40;
/** Tiles shown in an open category before "Show all N". */
const PREVIEW = 9;
/** Pseudo-group for the Widgets section. */
type Sec = LibGroup | "widgets";

/* Which category is open: one at a time, remembered per device (Traffic sources the first time). */
const OPEN_KEY = "fm-lib-open";
const DEFAULT_OPEN: Sec = "traffic";
const openListeners = new Set<() => void>();
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) ?? DEFAULT_OPEN;
  } catch {
    return DEFAULT_OPEN;
  }
};
const writeOpen = (v: string) => {
  try {
    localStorage.setItem(OPEN_KEY, v);
  } catch {}
  openListeners.forEach((l) => l());
};
const subscribeOpen = (cb: () => void) => (openListeners.add(cb), () => openListeners.delete(cb));
/** Open a category from outside (the collapsed rail's category icons). */
export const openCategory = (g: Sec) => writeOpen(g);

const GROUP_ICON: Record<Sec, string> = {
  traffic: "fbads",
  page: "optin",
  offer: "checkout",
  action: "purchase",
  comms: "emailone",
  community: "fbgroup",
  aicall: "aicallin",
  aiauto: "openai",
  sales: "hubspot",
  logic: "cond",
  annot: "note",
  widgets: "",
};

/** The representative tile of a category (first approved block, drawn at header size). */
export function CategoryIcon({ g, size = 20 }: { g: Sec; size?: number }) {
  if (g === "widgets") return <LibTile k="widget" type="widget" icon="chart" size={size} widget="Number" />;
  const it = ITEMS.find((i) => i.group === g) ?? BY_KEY[GROUP_ICON[g]];
  return it ? <LibTile k={it.key} type={it.payload.type} icon={it.icon} size={size} /> : null;
}

export function Palette({ products, clientName, onPicked, onCollapse }: { products: PaletteProduct[]; clientName?: string; onPicked?: () => void; onCollapse?: () => void }) {
  const [q, setQ] = useState("");
  const [all, setAll] = useState<Set<Sec>>(new Set());
  const cur = useEditor((x) => x.settings.currency);
  const recent = useList(RECENT_KEY);
  const fav = useList(FAV_KEY);
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => DEFAULT_OPEN) as Sec;
  const rf = useReactFlow();
  const input = useRef<HTMLInputElement>(null);
  const s = q.trim().toLowerCase();
  const counts = groupCounts();

  // "/" focuses the search from anywhere on the page (unless typing in a field)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.current?.focus();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);

  const toggleGroup = (g: Sec) => writeOpen(open === g ? "" : g);
  const addAtCentre = (payload: LibPayload, key?: string) => {
    const el = document.querySelector(".fm-stage")?.getBoundingClientRect();
    const c = el ? rf.screenToFlowPosition({ x: el.left + el.width / 2, y: el.top + el.height / 2 }) : { x: 200, y: 200 };
    addNode(payload.type, c.x - 105 + jitter(), c.y - 48 + jitter(), payload);
    markUsed(key);
    onPicked?.();
  };
  const dragProps = (payload: LibPayload, key?: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    },
    onDragEnd: (e: React.DragEvent) => {
      if (e.dataTransfer.dropEffect !== "none") markUsed(key);
      onPicked?.();
    },
  });

  /** One tile: the design's icon above a two-line label. Star pins it (shown on hover or when pinned). */
  const tile = (it: { key: string; label: string; icon: IconName; payload: LibPayload; group?: LibGroup }, aria = `Add ${it.label}`) => (
    <div key={it.key} className="fm-sb-cell">
      <button type="button" className="fm-sb-t" {...dragProps(it.payload, it.key)} onClick={() => addAtCentre(it.payload, it.key)} aria-label={aria} title={`${it.label}${it.group ? ` · ${LIB_GROUPS[it.group]}` : ""}\nDrag onto the map, or click to place it in view`}>
        <span className="fm-sb-i">
          <LibTile k={it.key} type={it.payload.type} icon={it.icon} size={32} />
        </span>
        <span className="fm-sb-l">{it.label}</span>
      </button>
      <button type="button" className={`fm-sb-fav${fav.includes(it.key) ? " on" : ""}`} aria-pressed={fav.includes(it.key)} aria-label={`Favourite ${it.label}`} title={fav.includes(it.key) ? "Remove from pinned" : "Pin to the top"} onClick={() => toggleFavKey(it.key)}>
        <Icon name="star" size={11} />
      </button>
    </div>
  );
  /** Recent and Pinned: the same tiles in a 3-up grid (named so they don't repeat the category "Add …" buttons). */
  const keyGrid = (title: string, keys: string[]) =>
    keys.length > 0 && (
      <>
        <div className="fm-sb-sec">
          <span>{title}</span>
        </div>
        <div className="fm-sb-g">
          {keys.slice(0, 6).map((k) => {
            const it = BY_KEY[k];
            if (!it) return null;
            return (
              <div key={k} className="fm-sb-cell">
                <button type="button" className="fm-sb-t" {...dragProps(it.payload, k)} onClick={() => addAtCentre(it.payload, k)} aria-label={`${title === "Pinned" ? "Favourite" : "Recent"}: ${it.label}`} title={`Add ${it.label}`}>
                  <span className="fm-sb-i">
                    <LibTile k={k} type={it.payload.type} icon={it.icon} size={32} />
                  </span>
                  <span className="fm-sb-l">{it.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </>
    );

  const prods = products.filter((p) => typeOf(p.type) && (!s || p.name.toLowerCase().includes(s)));
  const results = s ? searchLibrary(s) : [];
  const widgets = WIDGET_PRESETS.filter((w) => !s || `${w.label} widget ${w.help}`.toLowerCase().includes(s));
  const addCustom = () => addAtCentre({ type: "customevent", name: q.trim().slice(0, 120) });
  const productPrice = (p: PaletteProduct) => {
    const v = Number(p.params.price) || 0;
    return v ? `${money(v, cur)}${baseOf(p.type) === "sub" ? "/mo" : ""}` : "";
  };

  const widgetTile = (w: (typeof WIDGET_PRESETS)[number]) => (
    <div key={w.key} className="fm-sb-cell">
      <button type="button" className="fm-sb-t" {...dragProps({ type: "widget", p: w.p, name: w.label })} onClick={() => addAtCentre({ type: "widget", p: w.p, name: w.label })} aria-label={`Add widget: ${w.label}`} title={`${w.help}\nScope and metrics are set in the panel after placing.`}>
        <span className="fm-sb-i">
          <LibTile k={`widget-${w.key}`} type="widget" icon="chart" size={32} widget={w.label} />
        </span>
        <span className="fm-sb-l">{w.label}</span>
      </button>
    </div>
  );

  const groups = Object.keys(LIB_GROUPS) as LibGroup[];
  return (
    <div className="fm-sb">
      <div className="fm-sb-h">
        <div className="fm-sb-ttl">
          <b>Blocks</b>
          {onCollapse && (
            <button type="button" aria-label="Collapse block library" title="Hide the library ([)" onClick={onCollapse}>
              <Icon name="chevronLeft" size={15} />
            </button>
          )}
        </div>
        <label className="fm-sb-s">
          <Icon name="search" size={15} />
          <span className="sr-only">Search blocks</span>
          <input
            ref={input}
            type="search"
            placeholder="Search blocks"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) addAtCentre(results[0].payload, results[0].key);
              if (e.key === "Escape") {
                setQ("");
                e.currentTarget.blur();
              }
            }}
          />
          <kbd>/</kbd>
        </label>
      </div>
      <div className="fm-sb-b">
        {!s && keyGrid("Recent", recent.filter((k) => !fav.includes(k)))}
        {!s && keyGrid("Pinned", fav)}
        {prods.length > 0 && (
          <>
            <div className="fm-sb-sec">
              <span>{clientName ? `${clientName}’s products` : "This client’s products"}</span>
              <span>{prods.length}</span>
            </div>
            {prods.map((p) => {
              const payload = { type: p.type, p: p.params, name: p.name };
              return (
                <button key={p.id} type="button" className="fm-sb-row" {...dragProps(payload)} onClick={() => addAtCentre(payload)} aria-label={`Add ${p.name}`} title={`Add ${p.name}\nDrag onto the map, or click to place it in view`}>
                  <span className="fm-sb-pi">
                    <LibTile k={p.type} type={p.type} icon={typeOf(p.type).icon} size={22} />
                  </span>
                  <span className="fm-sb-pn">{p.name}</span>
                  <span className="x">{productPrice(p)}</span>
                </button>
              );
            })}
          </>
        )}
        {s ? (
          <section aria-live="polite">
            {results.length > 0 || widgets.length > 0 || prods.length > 0 ? (
              <>
                <div className="fm-sb-sec">
                  <span>
                    {results.length} {results.length === 1 ? "result" : "results"}
                  </span>
                </div>
                <div className="fm-sb-g">{results.map((it) => tile(it))}</div>
                {widgets.length > 0 && <div className="fm-sb-g">{widgets.map(widgetTile)}</div>}
                {results.length > 0 && (
                  <p className="fm-sb-hint">
                    Press <b>Enter</b> to place the first result. Not here?{" "}
                    <button type="button" className="fm-sb-link" onClick={addCustom}>
                      Add “{q.trim().slice(0, 40)}” as a custom block
                    </button>
                  </p>
                )}
              </>
            ) : (
              <div className="fm-sb-empty">
                <b>No blocks match “{q.trim()}”</b>
                Try a shorter word, or add it as your own block. It behaves like any other block and keeps your icon.
                <button type="button" className="fm-sb-cta" onClick={addCustom}>
                  <Icon name="plus" size={14} /> Add “{q.trim().slice(0, 40)}” as a custom block
                </button>
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="fm-sb-sec">
              <span>All blocks</span>
            </div>
            {groups.map((g) => {
              const isOpen = open === g;
              const items = ITEMS.filter((it) => it.group === g);
              const shown = all.has(g) ? items : items.slice(0, PREVIEW);
              return (
                <section key={g} className={`fm-sb-acc${isOpen ? " open" : ""}`}>
                  <button type="button" className="fm-sb-ah" aria-expanded={isOpen} aria-controls={`fm-acc-${g}`} onClick={() => toggleGroup(g)}>
                    <span className="fm-sb-ahi">
                      <CategoryIcon g={g} />
                    </span>
                    <span className="fm-sb-ahn">{LIB_GROUPS[g]}</span>
                    <span className="fm-sb-ahc">{counts[g]}</span>
                    <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={14} />
                  </button>
                  {isOpen && (
                    <div id={`fm-acc-${g}`}>
                      <div className="fm-sb-g">{shown.map((it) => tile(it))}</div>
                      {items.length > shown.length && (
                        <button type="button" className="fm-sb-more" onClick={() => setAll(new Set(all).add(g))}>
                          Show all {items.length}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
            <section className={`fm-sb-acc${open === "widgets" ? " open" : ""}`}>
              <button type="button" className="fm-sb-ah" aria-expanded={open === "widgets"} aria-controls="fm-acc-widgets" onClick={() => toggleGroup("widgets")}>
                <span className="fm-sb-ahi">
                  <CategoryIcon g="widgets" />
                </span>
                <span className="fm-sb-ahn">Widgets</span>
                <span className="fm-sb-ahc">{WIDGET_PRESETS.length}</span>
                <Icon name={open === "widgets" ? "chevronDown" : "chevronRight"} size={14} />
              </button>
              {open === "widgets" && (
                <div id="fm-acc-widgets">
                  <div className="fm-sb-g">{WIDGET_PRESETS.map(widgetTile)}</div>
                  <p className="fm-sb-hint">Drag onto the map, or click to place it in view</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
