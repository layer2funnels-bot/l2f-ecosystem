"use client";
// Add a block (V5): a small, fast popup (420 x 380 at most). Double-click empty canvas (or press /) to search the library and drop a
// block there. Also opens when a connection is dragged off an open port into empty space (the block lands at the release point,
// already connected) and from "Insert step on line". Same library definitions as the left Blocks panel; categories live in one
// dropdown beside the search box, every block is a picture, and the whole thing works from the keyboard.
import { useReactFlow } from "@xyflow/react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { CATCOLOR, groupColor, LIB_GROUPS, picRect, typeOf, type LibGroup } from "@/lib/catalog";
import { addConnectedNode, addNode, canFollowType, canInsertType, closeQuickAdd, insertStepOnEdge, openQuickAdd, setOpt, setSideTab, useEditor } from "@/lib/editor/store";
import { BY_KEY, ITEMS, searchLibrary, type LibItem } from "@/lib/library";
import { useBand } from "@/lib/use-band";
import { LibTile } from "./lib-tile";
import { FAV_KEY, markUsed, RECENT_KEY, useList } from "./library-lists";
import { searchCommands, type Command } from "@/lib/editor/commands";
import { kbd } from "@/lib/platform";

/** "Insert step on line": open Quick Add next to the connection's label. */
export function openInsertStep(edgeId: string) {
  const stage = document.querySelector(".fm-stage")?.getBoundingClientRect();
  const lbl = document.querySelector(`[data-edge="${edgeId}"]`)?.getBoundingClientRect();
  if (!stage || !lbl) return false;
  openQuickAdd({ sx: lbl.left - stage.left + lbl.width / 2, sy: lbl.top - stage.top + lbl.height / 2, fx: 0, fy: 0, edge: edgeId });
  return true;
}

export function QuickAdd() {
  const q = useEditor((s) => s.quick);
  if (!q) return null;
  return <QuickAddBox key={`${q.sx},${q.sy},${q.edge ?? ""},${q.from?.id ?? ""}`} />;
}

type Cat = "" | "recent" | LibGroup;
const CAT_KEY = "fm-quick-cat";
const COLS = 4;
const readCat = (): Cat => {
  try {
    const v = localStorage.getItem(CAT_KEY) ?? "";
    return v === "recent" || v in LIB_GROUPS ? (v as Cat) : "";
  } catch {
    return "";
  }
};

interface Tile {
  key: string;
  item?: LibItem;
  /** A command from the registry (free placement only), run instead of adding a block. */
  cmd?: Command;
  /** "Add a Custom block named …" when nothing matches. */
  custom?: string;
  /** Client product: preset params and name. */
  product?: { name: string; p: Record<string, unknown> };
}
interface Section {
  title: string;
  tiles: Tile[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The label with the typed words picked out. */
function Hl({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter(Boolean).map(esc);
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "ig"));
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

function QuickAddBox() {
  const q = useEditor((s) => s.quick)!;
  const products = useEditor((s) => s.products);
  const fav = useList(FAV_KEY);
  const recent = useList(RECENT_KEY);
  const [text, setText] = useState("");
  const [cat, setCatState] = useState<Cat>(readCat);
  const [menu, setMenu] = useState(false);
  const [mi, setMi] = useState(0);
  const [i, setI] = useState(0);
  const band = useBand();
  const phone = band === "phone";
  const rf = useReactFlow();
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedAt = useRef(0);
  const s = text.trim();
  const context = q.from ? "connect" : q.edge ? "insert" : "free";
  const valid = useCallback((it: LibItem) => (context === "connect" ? canFollowType(it.payload.type) : context === "insert" ? canInsertType(it.payload.type) : true), [context]);
  const setCat = (c: Cat) => {
    setCatState(c);
    setMenu(false);
    setI(0);
    try {
      localStorage.setItem(CAT_KEY, c);
    } catch {}
    inputRef.current?.focus();
  };

  // the category menu: every category with its live count, all from the registry
  const cats = useMemo(() => {
    const ok = ITEMS.filter(valid);
    const rec = recent.map((k) => BY_KEY[k]).filter((it): it is LibItem => !!it && valid(it));
    return [
      { id: "" as Cat, label: "All blocks", count: ok.length },
      { id: "recent" as Cat, label: "Recent", count: rec.length },
      ...(Object.keys(LIB_GROUPS) as LibGroup[]).map((g) => ({ id: g as Cat, label: LIB_GROUPS[g], count: ok.filter((it) => it.group === g).length })).filter((c) => c.count > 0),
    ];
  }, [recent, valid]);
  const catLabel = cat ? (cat === "recent" ? "Recent" : LIB_GROUPS[cat]) : "All";

  const searching = !!s;
  const { sections, flat } = useMemo(() => {
    const secs: Section[] = [];
    if (s) {
      const blocks = searchLibrary(s)
        .filter((it) => valid(it) && (!cat || cat === "recent" ? true : it.group === cat))
        .slice(0, 40)
        .map<Tile>((item) => ({ key: item.key, item }));
      const cmds = context === "free" && !cat ? searchCommands(s).slice(0, 4).map<Tile>((cmd) => ({ key: `cmd-${cmd.id}`, cmd })) : [];
      const tiles = [...blocks, ...cmds];
      if (!tiles.length && (context === "free" || canFollowType("customevent"))) tiles.push({ key: "custom", custom: s.slice(0, 120) });
      secs.push({ title: "Results", tiles });
    } else if (cat === "recent") {
      secs.push({ title: "Recent", tiles: recent.map((k) => BY_KEY[k]).filter((it): it is LibItem => !!it && valid(it)).map((item) => ({ key: item.key, item })) });
    } else if (cat) {
      secs.push({ title: LIB_GROUPS[cat], tiles: ITEMS.filter((it) => it.group === cat && valid(it)).map((item) => ({ key: item.key, item })) });
    } else {
      const seen = new Set<string>();
      const take = (keys: string[], max: number): Tile[] => {
        const out: Tile[] = [];
        for (const k of keys) {
          const item = BY_KEY[k];
          if (!item || !valid(item) || seen.has(k) || out.length >= max) continue;
          seen.add(k);
          out.push({ key: k, item });
        }
        return out;
      };
      const pinned = take(fav, 4);
      if (pinned.length) secs.push({ title: "Pinned", tiles: pinned });
      const prod: Tile[] = [];
      products.forEach((p) => {
        const item = ITEMS.find((it) => it.key === p.type);
        if (item && valid(item) && prod.length < 4) prod.push({ key: `p-${p.name}`, item, product: { name: p.name, p: p.params } });
      });
      if (prod.length) secs.push({ title: "Client products", tiles: prod });
      const rec = take(recent, 4);
      if (rec.length) secs.push({ title: "Recent", tiles: rec });
      secs.push({ title: "Common", tiles: take(["landing", "optin", "checkout", "upsell", "seq", "cond", "fbads", "note"], 4) });
    }
    return { sections: secs.filter((x) => x.tiles.length), flat: secs.flatMap((x) => x.tiles) };
  }, [s, cat, fav, recent, products, context, valid]);

  const pick = (k: number) => {
    const r = flat[k];
    if (!r) return;
    if (r.cmd) {
      closeQuickAdd();
      r.cmd.run();
      return;
    }
    const payload = r.custom ? { type: "customevent", name: r.custom } : r.item ? { ...r.item.payload, ...(r.product ? { p: r.product.p, name: r.product.name } : {}) } : null;
    if (!payload) return;
    if (q.from) addConnectedNode(q.from, payload.type, q.fx, q.fy, payload);
    else if (q.edge) insertStepOnEdge(q.edge, payload.type, payload);
    else {
      // the block lands centred on the point that was clicked (its picture, not its name), snapped to the grid
      const r2 = picRect(payload.type);
      addNode(payload.type, q.centre ? q.fx - (r2.x + r2.w / 2) : q.fx, q.centre ? q.fy - (r2.y + r2.h / 2) : q.fy, payload);
    }
    if (r.item && !r.product) markUsed(r.item.key);
    closeQuickAdd();
  };

  const heading = context === "connect" ? "Add the next step" : context === "insert" ? "Insert a step on this line" : "Add a block";
  const close = closeQuickAdd;
  const browse = () => {
    closeQuickAdd();
    if (phone) setTimeout(() => document.querySelector<HTMLButtonElement>(".fm-libbtn, .fm-fab")?.click(), 30);
    else {
      setSideTab("library");
      setOpt("hideSide", false);
    }
  };

  // rows of the grid (a section is a run of rows of four): arrows move between them
  const gridRows = useMemo(() => {
    const rows: number[][] = [];
    let at = 0;
    sections.forEach((sec) => {
      for (let n = 0; n < sec.tiles.length; n += COLS) rows.push(sec.tiles.slice(n, n + COLS).map((_, c) => at + n + c));
      at += sec.tiles.length;
    });
    return rows;
  }, [sections]);
  const step = (dx: number, dy: number) => {
    if (searching || phone) return setI((v) => Math.max(0, Math.min(flat.length - 1, v + (dy || dx) * (phone && dy ? 2 : 1))));
    const r = gridRows.findIndex((row) => row.includes(i));
    if (r < 0) return;
    if (dx) return setI((v) => Math.max(0, Math.min(flat.length - 1, v + dx)));
    const col = gridRows[r].indexOf(i);
    const to = gridRows[Math.max(0, Math.min(gridRows.length - 1, r + dy))];
    setI(to[Math.min(col, to.length - 1)]);
  };

  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  // keep the focused tile in view while moving with the keyboard. Only the list scrolls (scrollIntoView would also nudge the canvas).
  useEffect(() => {
    const box = listRef.current;
    const row = flat[i] && box?.querySelector<HTMLElement>(`[id="fm-quick-${flat[i].key}"]`);
    if (!box || !row) return;
    const u = box.getBoundingClientRect(),
      r = row.getBoundingClientRect();
    if (r.top < u.top) box.scrollTop -= u.top - r.top + 28;
    else if (r.bottom > u.bottom) box.scrollTop += r.bottom - u.bottom + 6;
  }, [i, flat]);

  // Placement. Desktop / tablet: beside the point it was opened from (about +120 px right, 18 px up), flipping left, below or above
  // near an edge, and never over the spot the block will land. Phone: a bottom sheet above the keyboard.
  useLayoutEffect(() => {
    const el = boxRef.current;
    const stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage) return;
    if (phone) {
      el.style.cssText = "";
      return;
    }
    const SW = stage.clientWidth,
      SH = stage.clientHeight,
      M = 12;
    const width = Math.max(Math.min(360, SW - 2 * M), Math.min(420, SW - 2 * M));
    const maxH = Math.max(Math.min(320, SH - 2 * M), Math.min(380, SH - 2 * M));
    el.style.width = `${width}px`;
    el.style.maxHeight = `${maxH}px`;
    el.style.height = `${maxH}px`;
    const h = maxH;
    // the landing spot (a block's picture is about 104 x 128) with a little air
    const spot = context === "free" ? { l: q.sx - 52 - 10, r: q.sx + 52 + 10, t: q.sy - 64 - 10, b: q.sy + 64 + 10 } : { l: q.sx - 12, r: q.sx + 12, t: q.sy - 12, b: q.sy + 12 };
    const fits = (l: number, t: number) => l >= M && t >= M && l + width <= SW - M && t + h <= SH - M;
    const clear = (l: number, t: number) => l + width <= spot.l || l >= spot.r || t + h <= spot.t || t >= spot.b;
    const clampT = (t: number) => Math.max(M, Math.min(SH - M - h, t));
    const clampL = (l: number) => Math.max(M, Math.min(SW - M - width, l));
    const cands: [number, number][] = [
      [q.sx + 120, q.sy - 18],
      [q.sx - 120 - width, q.sy - 18],
      [spot.r, clampT(q.sy - 18)],
      [clampL(q.sx - width / 2), spot.b],
      [clampL(q.sx - width / 2), spot.t - h],
    ];
    let pick2 = cands.find(([l, t]) => fits(l, t) && clear(l, t));
    if (!pick2) pick2 = cands.map(([l, t]) => [clampL(l), clampT(t)] as [number, number]).find(([l, t]) => clear(l, t)) ?? [clampL(q.sx + 120), clampT(q.sy - 18)];
    el.style.left = `${Math.round(pick2[0])}px`;
    el.style.top = `${Math.round(pick2[1])}px`;
  }, [phone, q.sx, q.sy, context]);

  useEffect(() => {
    if (!phone) return;
    const el = boxRef.current;
    const vv = window.visualViewport;
    const fit = () => {
      if (!el) return;
      const h = vv?.height ?? window.innerHeight;
      el.style.bottom = `${Math.max(0, window.innerHeight - h - (vv?.offsetTop ?? 0))}px`;
      el.style.maxHeight = `${Math.round(Math.min(h * 0.62, h - 12))}px`;
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    // pan so the point being connected from stays above the sheet (a fixed element has no offsetParent: find the canvas by class)
    const stage = document.querySelector<HTMLElement>(".fm-stage");
    const t = setTimeout(() => {
      if (!el || !stage) return;
      const sr = stage.getBoundingClientRect(),
        er = el.getBoundingClientRect();
      const ay = sr.top + q.sy;
      const limit = er.top - 40;
      // bring the release point and the block it came from above the sheet, without pushing the block off the top of the canvas
      const src = q.from ? document.querySelector<HTMLElement>(`.react-flow__node[data-id="${q.from.id}"]`)?.getBoundingClientRect() : undefined;
      let dy = Math.max(0, ay - limit + 20, src ? src.bottom - limit + 20 : 0);
      if (src) dy = Math.min(dy, src.top - (sr.top + 56));
      if (dy > 4) {
        const vp = rf.getViewport();
        rf.setViewport({ ...vp, y: vp.y - dy }, { duration: 200 });
      }
    }, 80);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      clearTimeout(t);
    };
  }, [phone, q.sy, q.from, rf]);

  // close on a tap outside, or when focus leaves the box (Tab away); moving inside it keeps it open
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (e.target instanceof Node && !boxRef.current?.contains(e.target)) close();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [close]);

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setMenu((v) => !v);
      setMi(Math.max(0, cats.findIndex((c) => c.id === cat)));
      return;
    }
    if (menu) {
      if (e.key === "ArrowDown") (e.preventDefault(), setMi((v) => Math.min(cats.length - 1, v + 1)));
      else if (e.key === "ArrowUp") (e.preventDefault(), setMi((v) => Math.max(0, v - 1)));
      else if (e.key === "Enter") (e.preventDefault(), cats[mi] && setCat(cats[mi].id));
      else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), setMenu(false));
      return;
    }
    const gridMode = !searching && !phone;
    const act: Record<string, () => void> = {
      ArrowDown: () => step(0, 1),
      ArrowUp: () => step(0, -1),
      Enter: () => pick(i),
    };
    if (gridMode) {
      act.ArrowRight = () => step(1, 0);
      act.ArrowLeft = () => step(-1, 0);
    }
    if (!text) {
      act.Home = () => setI(0);
      act.End = () => setI(Math.max(0, flat.length - 1));
    }
    if (act[e.key]) {
      e.preventDefault();
      act[e.key]();
    }
  };

  const dialog = (
    <div
      ref={boxRef}
      className={`fm-qa${phone ? " sheet" : ""}`}
      style={phone ? undefined : { left: q.sx, top: q.sy }}
      role="dialog"
      aria-label={heading}
      aria-modal="false"
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null) || !e.relatedTarget) return;
        // the canvas may still be taking focus back right after the release that opened this: keep the box and the caret
        if (Date.now() - openedAt.current < 500) return void inputRef.current?.focus();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        } else if (e.target !== inputRef.current && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // typing anywhere starts the search
          inputRef.current?.focus();
        }
      }}
    >
      {phone && <span className="grab" aria-hidden="true" />}
      <div className="fm-qa-in">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          autoFocus={!phone || context === "free"}
          aria-label="Search blocks to add"
          placeholder={context === "free" ? "Add a block…" : `${heading}…`}
          value={text}
          role="combobox"
          aria-expanded={menu ? "true" : "false"}
          aria-haspopup="listbox"
          aria-controls={menu ? "fm-quick-cats" : "fm-quick-list"}
          aria-activedescendant={menu ? `fm-quick-cat-${cats[mi]?.id || "all"}` : flat[i] ? `fm-quick-${flat[i].key}` : undefined}
          enterKeyHint="go"
          onChange={(e) => (setText(e.target.value), setI(0))}
          onKeyDown={onInputKey}
        />
        <button
          type="button"
          className="fm-qa-cat"
          aria-haspopup="listbox"
          aria-expanded={menu}
          aria-label={`Category: ${catLabel}. Change category`}
          title={`Category (${kbd("mod+K")})`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (setMenu((v) => !v), setMi(Math.max(0, cats.findIndex((c) => c.id === cat))), inputRef.current?.focus())}
        >
          <span>{catLabel}</span>
          <Icon name="chevronDown" size={12} />
        </button>
        {phone && (
          <button type="button" className="fm-qa-x" aria-label="Close" onClick={close}>
            <Icon name="close" size={16} />
          </button>
        )}
        {menu && (
          <ul id="fm-quick-cats" className="fm-qa-menu" role="listbox" aria-label="Categories">
            {cats.map((c, k) => (
              <li
                key={c.id || "all"}
                id={`fm-quick-cat-${c.id || "all"}`}
                role="option"
                aria-selected={c.id === cat}
                className={k === mi ? "cur" : undefined}
                onMouseMove={() => mi !== k && setMi(k)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setCat(c.id);
                }}
              >
                <i style={{ background: c.id && c.id !== "recent" ? CATCOLOR[groupColor(c.id as LibGroup)] : "var(--muted)" }} aria-hidden="true" />
                <span>{c.label}</span>
                <small>{c.count}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div id="fm-quick-list" ref={listRef} className={`fm-qa-list${searching ? " rows" : ""}`} role="listbox" aria-label="Blocks">
        {searching && flat.length > 0 && !flat[0].custom && (
          <p className="fm-qa-h" role="presentation">
            {flat.length} {flat.length === 1 ? "result" : "results"} for “{s}”
          </p>
        )}
        {sections.map((sec) => {
          const base = flat.indexOf(sec.tiles[0]);
          return (
            <Fragment key={sec.title}>
              {!searching && (
                <p className="fm-qa-h" role="presentation">
                  {sec.title}
                  {cat && cat !== "recent" ? ` · ${sec.tiles.length}` : ""}
                </p>
              )}
              <div className={searching ? "fm-qa-rows" : "fm-qa-grid"} role="presentation">
                {sec.tiles.map((t, n) => {
                  const k = base + n;
                  const cur = k === i;
                  const label = t.custom ? `Add a Custom block named “${t.custom}”` : t.cmd ? t.cmd.label : t.product ? t.product.name : t.item!.label;
                  return (
                    <div
                      key={t.key}
                      id={`fm-quick-${t.key}`}
                      role="option"
                      aria-selected={cur}
                      aria-label={t.custom ? label : `${label}${t.item ? `, ${LIB_GROUPS[t.item.group]}` : ""}`}
                      className="fm-qa-t"
                      onMouseMove={() => i !== k && setI(k)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(k);
                      }}
                    >
                      <span className="pic" aria-hidden="true">
                        {t.cmd ? (
                          <Icon name={t.cmd.icon ?? "zap"} size={18} />
                        ) : t.custom ? (
                          <Icon name="plus" size={18} />
                        ) : (
                          <LibTile k={t.item!.key} type={t.item!.payload.type} icon={t.item!.icon} size={searching ? 30 : 44} />
                        )}
                      </span>
                      <span className="nm">{searching && !t.custom && !t.cmd ? <Hl text={label} q={s} /> : label}</span>
                      {searching && (
                        <small>{t.cmd ? (t.cmd.shortcut ? kbd(t.cmd.shortcut) : "Command") : t.item ? (t.product ? typeOf(t.item.payload.type).label : LIB_GROUPS[t.item.group]) : ""}</small>
                      )}
                      {cur && !phone && <em className="ent">Enter</em>}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          );
        })}
        {searching && flat[0]?.custom && (
          <p className="fm-qa-none" role="presentation">
            No block called “{s}”
          </p>
        )}
        {!flat.length && (
          <p className="fm-qa-none" role="presentation">
            {cat === "recent" ? "Nothing used yet. Blocks you add show up here." : `No blocks${context !== "free" ? " that can follow here" : ""}.`}
          </p>
        )}
      </div>
      <div className="fm-qa-foot">
        {!phone && (
          <span className="hints">
            <kbd>↑↓←→</kbd> move <kbd>Enter</kbd> place <kbd>Esc</kbd> close
          </span>
        )}
        <button type="button" className="fm-qa-browse" onMouseDown={(e) => e.preventDefault()} onClick={browse}>
          Browse all blocks ›
        </button>
      </div>
    </div>
  );
  const ghost =
    context === "free" ? (
      <div className="fm-qa-ghost" style={{ left: q.sx, top: q.sy }} aria-hidden="true">
        <span className="box" />
        <span className="h" />
        <span className="v" />
      </div>
    ) : null;
  // a phone sheet sits above every other panel (the details sheet shares the canvas's stacking order)
  return (
    <>
      {ghost}
      {phone ? createPortal(dialog, document.body) : dialog}
    </>
  );
}
