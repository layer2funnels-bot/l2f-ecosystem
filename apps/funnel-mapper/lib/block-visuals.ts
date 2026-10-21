// Visual definition of every library block: ONE place that says how a block *looks* (family shape, page
// wireframe, brand tint). Behaviour, maths and identity stay in lib/catalog.ts (TYPES, `base`, type keys).
//
// Block type key -> visualOf() -> the shared renderers in components/editor/block-visual.tsx and the card/tile CSS
// in editor.css. Library tiles, canvas cards, the performance map, presentation and shared views all read this.
//
// INTERIM BASELINE: built from reference/DESIGN_V2_HANDOFF.md (families, canonical anatomy) and
// reference/project/Blocks-and-lines.dc.html (wireframe vocabulary). The final human-reviewed Figma 169 library
// replaces the DATA below (families, wireframes, brand tints), not the renderer or any block identity.
import { baseOf, blockFamily, isBlockType, typeOf } from "./catalog";
import { WINDOWS } from "./design-tiles";

export type Family = "source" | "page" | "offer" | "message" | "action" | "logic" | "goal" | "note";

/** Semantic page wireframes drawn in the preview strip of page and offer blocks. */
export type Wireframe = "optin" | "sales" | "video" | "webinar" | "quiz" | "app" | "calendar" | "thanks" | "order" | "up" | "down" | "sub" | "members";

export interface BlockVisual {
  family: Family;
  /** Page and offer families only. */
  wireframe?: Wireframe;
  /** Recognisable brand tint for the icon tile (traffic sources, messaging). The glyph is still the block's own icon. */
  brand?: string;
}

/** How each family is drawn. Card and tile geometry itself lives in editor.css under `.fam-<family>`. */
export const FAMILIES: Record<Family, { label: string; /** Preview strip above the header. */ strip: boolean; /** Price tab on the card. */ price: boolean }> = {
  source: { label: "Traffic source", strip: false, price: false },
  page: { label: "Page", strip: true, price: false },
  offer: { label: "Offer", strip: true, price: true },
  message: { label: "Message", strip: false, price: false },
  action: { label: "Action / event", strip: false, price: false },
  logic: { label: "Logic", strip: false, price: false },
  goal: { label: "Goal", strip: false, price: false },
  note: { label: "Notes & layout", strip: false, price: false },
};

/** Page type -> wireframe. Any page not listed uses `sales`. */
const PAGE_WF: Record<string, Wireframe> = {
  optin: "optin", squeeze: "optin", leadmag: "optin", webreg: "optin", popup: "optin", modal: "optin",
  quizp: "quiz", survey: "quiz",
  apply: "app", qualify: "app", contract: "app", login: "app",
  vsl: "video", replay: "video", lesson: "video",
  webinar: "webinar",
  booking: "calendar",
  thanks: "thanks", confirm: "thanks", delivery: "thanks", callconf: "thanks",
  members: "members", community: "members", course: "members",
  orderp: "order", cartp: "order",
  upsellp: "up", downsellp: "down",
  longsales: "sales", homeabout: "sales",
};

/** Offer type -> wireframe. Any offer not listed uses `order`. */
const OFFER_WF: Record<string, Wireframe> = {
  bump: "up", upsell: "up", oto: "up",
  downsell: "down",
  sub: "sub", membership: "sub",
  onestep: "order", twostep: "order", cartoffer: "order",
};

/** Brand tints (traffic sources and messaging whose brand is unambiguous). Marks come later from a licensed icon set. */
const BRAND: Record<string, string> = {
  fbads: "#1877F2", fborg: "#1877F2",
  igads: "#E4405F", igorg: "#E4405F",
  gads: "#4285F4",
  ytads: "#FF0000", ytorg: "#FF0000",
  ttads: "#010101", ttorg: "#010101", xorg: "#000000", threads: "#000000",
  liads: "#0A66C2", liorg: "#0A66C2",
  pinads: "#E60023",
  xads: "#000000",
  redditads: "#FF4500",
  bingads: "#174AE4",
  follow: "#25D366", wab: "#25D366",
  quoraads: "#B92B27",
};

const familyOf = (type: string): Family => blockFamily(type);

const cache = new Map<string, BlockVisual>();

/** Visual definition for a block type key (unknown keys and annotation presets read as `note`). */
export function visualOf(type: string): BlockVisual {
  let v = cache.get(type);
  if (!v) {
    const family = isBlockType(type) ? familyOf(type) : "note";
    v = { family, wireframe: family === "page" ? (PAGE_WF[type] ?? "sales") : family === "offer" ? (OFFER_WF[type] ?? "order") : undefined, brand: BRAND[type] };
    cache.set(type, v);
  }
  return v;
}

/** Logic blocks that split people by a share (Yes/No, A/B): they draw a split bar. */
export const hasSplitBar = (type: string) => {
  const b = baseOf(type);
  return b === "cond" || b === "split";
};

// ---- page wireframes (data, 174 x 30 viewBox) ------------------------------------------------------------
// r = rect [x, y, w, h, rx], c = circle [cx, cy, r], p = path [d]. Paint: o = outline, d = dim fill, m = mid fill,
// a = accent fill (the block's category colour), ao = accent outline / stroke.
export type WfPaint = "o" | "d" | "m" | "a" | "ao";
export type WfShape = ["r", number, number, number, number, number, WfPaint] | ["c", number, number, number, WfPaint] | ["p", string, WfPaint];

export const WF_SIZE = { w: 174, h: 30 } as const;

export const WIREFRAMES: Record<Wireframe, WfShape[]> = {
  optin: [
    ["r", 30, 4, 114, 3, 1.5, "m"], ["r", 50, 10, 74, 2.5, 1.2, "d"],
    ["r", 30, 15, 82, 9, 2, "o"], ["r", 116, 15, 28, 9, 2, "a"],
  ],
  sales: [
    ["r", 8, 4, 90, 4, 1.5, "m"], ["r", 8, 11, 70, 2.5, 1.2, "d"], ["r", 8, 16, 80, 2.5, 1.2, "d"], ["r", 8, 22, 36, 5, 2, "a"],
    ["r", 112, 4, 54, 22, 3, "o"],
  ],
  video: [
    ["r", 36, 3, 102, 19, 3, "o"], ["p", "M80 8.5l12 4-12 4z", "a"], ["r", 36, 25, 102, 2.5, 1.2, "d"], ["r", 36, 25, 44, 2.5, 1.2, "a"],
  ],
  webinar: [
    ["r", 8, 4, 98, 22, 3, "o"], ["p", "M51 11l12 4-12 4z", "a"], ["c", 15, 9, 2, "a"],
    ["r", 114, 6, 50, 2.5, 1.2, "d"], ["r", 114, 12, 38, 2.5, 1.2, "m"], ["r", 114, 18, 46, 2.5, 1.2, "d"], ["r", 114, 24, 30, 2.5, 1.2, "d"],
  ],
  quiz: [
    ["c", 12, 8, 2.6, "a"], ["r", 19, 6.8, 90, 2.6, 1.5, "m"], ["c", 12, 15, 2.6, "o"], ["r", 19, 13.8, 70, 2.6, 1.5, "d"],
    ["c", 12, 22, 2.6, "o"], ["r", 19, 20.8, 80, 2.6, 1.5, "d"], ["r", 130, 18, 36, 8, 2, "a"],
  ],
  app: [
    ["r", 8, 3, 100, 7, 1.5, "o"], ["r", 8, 12, 100, 7, 1.5, "o"], ["r", 8, 21, 100, 7, 1.5, "o"],
    ["c", 128, 8, 3, "a"], ["c", 140, 8, 3, "o"], ["c", 152, 8, 3, "o"], ["r", 122, 20, 40, 7, 2, "a"],
  ],
  calendar: [
    ["r", 8, 4, 10, 6, 1.5, "o"], ["r", 22, 4, 10, 6, 1.5, "o"], ["r", 36, 4, 10, 6, 1.5, "o"], ["r", 50, 4, 10, 6, 1.5, "o"], ["r", 64, 4, 10, 6, 1.5, "o"], ["r", 78, 4, 10, 6, 1.5, "o"], ["r", 92, 4, 10, 6, 1.5, "o"],
    ["r", 8, 13, 10, 6, 1.5, "o"], ["r", 22, 13, 10, 6, 1.5, "o"], ["r", 36, 13, 10, 6, 1.5, "a"], ["r", 50, 13, 10, 6, 1.5, "o"], ["r", 64, 13, 10, 6, 1.5, "o"], ["r", 78, 13, 10, 6, 1.5, "o"], ["r", 92, 13, 10, 6, 1.5, "o"],
    ["r", 8, 22, 10, 6, 1.5, "o"], ["r", 22, 22, 10, 6, 1.5, "o"], ["r", 36, 22, 10, 6, 1.5, "o"], ["r", 50, 22, 10, 6, 1.5, "o"],
    ["r", 118, 4, 46, 6, 2, "o"], ["r", 118, 13, 46, 6, 2, "ao"], ["r", 118, 22, 46, 6, 2, "o"],
  ],
  thanks: [
    ["c", 30, 15, 9, "ao"], ["p", "M25 15l4 4 7-8", "ao"],
    ["r", 52, 8, 84, 3.5, 1.5, "m"], ["r", 52, 15, 64, 2.5, 1.2, "d"], ["r", 52, 21, 44, 2.5, 1.2, "d"],
  ],
  members: [
    ["r", 8, 4, 26, 22, 3, "o"], ["r", 12, 8, 14, 2.5, 1.2, "m"], ["r", 12, 14, 18, 2.5, 1.2, "d"], ["r", 12, 20, 12, 2.5, 1.2, "d"],
    ["r", 42, 4, 38, 10, 2, "o"], ["r", 84, 4, 38, 10, 2, "o"], ["r", 126, 4, 40, 10, 2, "o"],
    ["r", 42, 17, 38, 9, 2, "a"], ["r", 84, 17, 38, 9, 2, "o"], ["r", 126, 17, 40, 9, 2, "o"],
  ],
  order: [
    ["r", 8, 4, 100, 7, 1.5, "o"], ["r", 8, 14, 48, 7, 1.5, "o"], ["r", 60, 14, 48, 7, 1.5, "o"],
    ["r", 118, 4, 48, 2.5, 1.5, "d"], ["r", 118, 10, 40, 2.5, 1.5, "d"], ["r", 118, 17, 48, 3.5, 1.5, "m"], ["r", 8, 24, 100, 3, 1.5, "a"],
  ],
  up: [
    ["r", 8, 4, 26, 22, 3, "o"], ["r", 42, 6, 70, 3.5, 1.5, "m"], ["r", 42, 13, 90, 2.5, 1.5, "d"],
    ["r", 42, 21, 48, 6, 2, "a"], ["r", 96, 21, 40, 6, 2, "o"], ["p", "M156 22V10 M151 15l5-5 5 5", "ao"],
  ],
  down: [
    ["r", 8, 4, 26, 22, 3, "o"], ["r", 42, 6, 70, 3.5, 1.5, "m"], ["r", 42, 13, 90, 2.5, 1.5, "d"],
    ["r", 42, 21, 48, 6, 2, "a"], ["r", 96, 21, 40, 6, 2, "o"], ["p", "M156 8v12 M151 15l5 5 5-5", "ao"],
  ],
  sub: [
    ["r", 8, 5, 24, 20, 3, "o"], ["r", 38, 5, 24, 20, 3, "a"], ["r", 68, 5, 24, 20, 3, "o"],
    ["r", 102, 8, 56, 3.5, 1.5, "m"], ["r", 102, 15, 40, 2.5, 1.5, "d"], ["p", "M150 20a4 4 0 1 1-1.2-2.8", "ao"],
  ],
};

// ---- card geometry (shared by the canvas CSS in editor.css and the SVG map export in lib/export.ts) -----------
/** Vertical rhythm of a flow block (px). The card is `nodeW` x `blockH` (lib/catalog.ts) with these parts inside. */
export const CARD = { border: 1, padY: 8, head: 33, stats: 16, strip: 30, bar: 4, goalBar: 6, dashedStats: 6 } as const;

export type TileShape = "circle" | "rounded" | "square" | "diamond" | "pill";
/** Per family: card corner radii [tl, tr, br, bl], horizontal padding [left, right], tile shape/size, and extras. */
export const FAMILY_GEOM: Record<Family, { radii: [number, number, number, number]; pad: [number, number]; tile: TileShape; tileSize: number; tileR: number; dashedStats: boolean; hatch: boolean }> = {
  source: { radii: [26, 10, 10, 26], pad: [16, 10], tile: "circle", tileSize: 32, tileR: 16, dashedStats: true, hatch: false },
  page: { radii: [10, 10, 10, 10], pad: [10, 10], tile: "rounded", tileSize: 28, tileR: 6, dashedStats: false, hatch: false },
  offer: { radii: [10, 10, 10, 10], pad: [10, 10], tile: "rounded", tileSize: 28, tileR: 6, dashedStats: false, hatch: false },
  message: { radii: [24, 24, 24, 24], pad: [16, 16], tile: "circle", tileSize: 32, tileR: 16, dashedStats: true, hatch: false },
  action: { radii: [24, 24, 24, 24], pad: [16, 16], tile: "diamond", tileSize: 32, tileR: 8, dashedStats: false, hatch: false },
  logic: { radii: [4, 4, 4, 4], pad: [10, 10], tile: "square", tileSize: 32, tileR: 4, dashedStats: false, hatch: true },
  goal: { radii: [24, 24, 24, 24], pad: [16, 16], tile: "pill", tileSize: 32, tileR: 12, dashedStats: false, hatch: false },
  note: { radii: [14, 14, 14, 14], pad: [10, 10], tile: "rounded", tileSize: 32, tileR: 9, dashedStats: false, hatch: false },
};


/** Library key of the browser-window drawing for a page or offer type (types the library does not list use their wireframe's). */
const WINDOW_BY_WF: Record<Wireframe, string> = { optin: "optin", sales: "sales", video: "vsl", webinar: "webinar", quiz: "quizp", app: "apply", calendar: "booking", thanks: "thanks", order: "checkout", up: "upsell", down: "downsell", sub: "sub", members: "members" };
export function windowKeyOf(type: string): string {
  const v = visualOf(type);
  return WINDOW_KEYS.has(type) ? type : WINDOW_BY_WF[v.wireframe ?? (v.family === "offer" ? "order" : "sales")];
}
const WINDOW_KEYS = new Set(Object.keys(WINDOWS));

/** Short type caption on a page / offer object ("OPT-IN PAGE", "APPLICATION", "CHECKOUT"). */
const CAPTION: Record<string, string> = { webreg: "Webinar", webinar: "Webinar", replay: "Replay", apply: "Application", booking: "Booking", checkout: "Checkout", onestep: "One-step order", twostep: "Two-step order", bump: "Order bump", upsell: "Upsell", downsell: "Downsell", sub: "Subscription", plan: "Payment plan", cartoffer: "Cart", coupon: "Coupon" };
export const typeCaption = (type: string): string => CAPTION[type] ?? typeOf(type)?.label ?? type;
