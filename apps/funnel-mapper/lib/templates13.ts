// The 13 approved V2 templates (reference/preview-renderer/templates13.py, board "V2-template-structures"): names and
// order are the owner's. Versioned static data, kept easy to edit: each block is [id, type, name, column, row,
// optional?] on a 250 x 150 grid; each line is [from, to, kind?, side?] where kind is flow | no (leak) | skip and side
// "b" leaves from the bottom. Dashed (optional) blocks carry `optional: true` and a dashed border.
//
// Sample numbers use the existing example-number mechanism: every block starts with its type's defaults
// (lib/catalog.ts), and one example traffic source feeds the first step so the numbers flow. "Start with empty numbers"
// leaves the same structure with zero traffic, rates and prices (and no example source).
import { blockPivot, defaultsFor, PITCH, typeOf, type NodeParams } from "./catalog";
import type { FunnelEdge, FunnelGraph, FunnelNode, Side } from "./graph";

type B = [id: string, type: string, name: string, col: number, row: number, optional?: boolean];
type L = [from: string, to: string, kind?: "flow" | "no" | "skip", side?: "b"];

export interface Template13 {
  /** Stable key ("builtin:<key>" in pickers). */
  key: string;
  n: number;
  name: string;
  description: string;
  blocks: B[];
  lines: L[];
}

const range = (k: number) => Array.from({ length: k }, (_, i) => i);

export const TEMPLATES13: Template13[] = [
  {
    key: "v2-lead-squeeze",
    n: 1,
    name: "Lead Squeeze",
    description: "Opt-in → Form Completed → Thank You (download) → Delivery Email → Download. Optional core offer and Add to Cart.",
    blocks: [["o", "optin", "Opt-in", 0, 0], ["f", "formsub", "Form Completed", 1, 0], ["t", "delivery", "Thank You (download)", 2, 0], ["e", "emailone", "Delivery Email", 3, 0], ["d", "delivery", "Download", 4, 0], ["c", "checkout", "Core offer", 3, 1, true], ["a", "addcart", "Add to Cart", 4, 1, true]],
    lines: [["o", "f"], ["f", "t"], ["t", "e"], ["e", "d"], ["t", "c", "skip", "b"], ["c", "a", "skip"]],
  },
  {
    key: "v2-survey",
    n: 2,
    name: "Survey",
    description: "Survey Opt-in → 3 segments (Form Completed → Thank You → Email Result each) → Offer Page.",
    blocks: [["s", "survey", "Survey Opt-in", 0, 1], ...range(3).flatMap((i): B[] => [[`f${i}`, "formsub", "Form Completed", 1, i], [`t${i}`, "thanks", "Thank You", 2, i], [`m${i}`, "emailone", "Email Result", 3, i]]), ["of", "sales", "Offer Page", 4, 1]],
    lines: range(3).flatMap((i): L[] => [["s", `f${i}`], [`f${i}`, `t${i}`], [`t${i}`, `m${i}`], [`m${i}`, "of"]]),
  },
  {
    key: "v2-summit",
    n: 3,
    name: "Summit",
    description: "Opt-in → Thank You with All-Access upgrade and order → Wait one-time offer → Thank You. Day 1–3 content pages are fed by emails.",
    blocks: [["o", "optin", "Opt-in", 0, 0], ["t", "thanks", "Thank You", 1, 0], ["a", "checkout", "All-Access order", 2, 0], ["w", "upsell", "Wait! One-time offer", 3, 0], ["t2", "thanks", "Thank You", 4, 0], ...range(3).flatMap((i): B[] => [[`e${i}`, "emailone", `Day ${i + 1} email`, 1, i + 1], [`p${i}`, "vsl", `Day ${i + 1} content`, 2, i + 1]])],
    lines: [["o", "t"], ["t", "a"], ["a", "w"], ["w", "t2"], ...range(3).flatMap((i): L[] => [["t", `e${i}`, "flow", "b"], [`e${i}`, `p${i}`]])],
  },
  {
    key: "v2-free-challenge",
    n: 4,
    name: "Free Challenge Funnel",
    description: "Opt-in → Upgrade page → one-time offer (optional) → Congratulations. Community / group, Day 1–5 pages fed by emails, then Join Today order → Thank You.",
    blocks: [["o", "optin", "Opt-in", 0, 0], ["u", "checkout", "Upgrade page", 1, 0], ["w", "upsell", "One-time offer", 2, 0, true], ["c", "thanks", "Congratulations", 3, 0], ["g", "fbgroup", "Community / group", 4, 0], ...range(5).flatMap((i): B[] => [[`e${i}`, "emailone", `Day ${i + 1} email`, 0, i + 1], [`p${i}`, "vsl", `Day ${i + 1} page`, 1, i + 1]]), ["j", "checkout", "Join Today", 3, 3], ["t2", "thanks", "Thank You", 4, 3]],
    // the daily emails follow each other (Day 1 → Day 5) so every day is reached
    lines: [["o", "u"], ["u", "w"], ["w", "c"], ["c", "g"], ["g", "e0", "flow", "b"], ...range(4).map((i): L => [`e${i}`, `e${i + 1}`, "flow", "b"]), ...range(5).map((i): L => [`e${i}`, `p${i}`]), ["p4", "j"], ["j", "t2"]],
  },
  {
    key: "v2-book",
    n: 5,
    name: "Book Funnel",
    description: "Order page → Wait upsell (optional downsell) → Next Logical Thing (optional downsell) → Thank You with offer wall.",
    blocks: [["o", "checkout", "Order page", 0, 0], ["w", "upsell", "Wait! Upsell", 1, 0], ["d1", "downsell", "Downsell", 1, 1, true], ["n", "upsell", "Next Logical Thing", 2, 0], ["d2", "downsell", "Downsell", 2, 1, true], ["t", "thanks", "Thank You + offer wall", 3, 0]],
    lines: [["o", "w"], ["w", "n"], ["n", "t"], ["w", "d1", "no", "b"], ["d1", "n"], ["n", "d2", "no", "b"], ["d2", "t"]],
  },
  {
    key: "v2-cart",
    n: 6,
    name: "Cart Funnel",
    description: "Order form (shipping speed, bump) → Add 2 / Add 1 upsell → Next SKU → Next SKU → Thank You with offer wall. Downsells are optional.",
    blocks: [["o", "checkout", "Order form", 0, 0], ["u", "upsell", "Add 2 / Add 1", 1, 0], ["d1", "downsell", "Downsell", 1, 1, true], ["s1", "upsell", "Next SKU", 2, 0], ["d2", "downsell", "Downsell", 2, 1, true], ["s2", "upsell", "Next SKU", 3, 0], ["d3", "downsell", "Downsell", 3, 1, true], ["t", "thanks", "Thank You + offer wall", 4, 0]],
    lines: [["o", "u"], ["u", "s1"], ["s1", "s2"], ["s2", "t"], ["u", "d1", "no", "b"], ["d1", "s1"], ["s1", "d2", "no", "b"], ["d2", "s2"], ["s2", "d3", "no", "b"], ["d3", "t"]],
  },
  {
    key: "v2-paid-challenge",
    n: 7,
    name: "Paid Challenge Funnel",
    description: "Sales page → Order form → Upgrade (bonus) → one-time offer → Thank You. Community, Day 1+ pages fed by emails, then Join Today order → Thank You.",
    blocks: [["s", "sales", "Sales page", 0, 0], ["o", "checkout", "Order form", 1, 0], ["u", "upsell", "Upgrade (bonus)", 2, 0], ["w", "upsell", "One-time offer", 3, 0], ["t", "thanks", "Thank You", 4, 0], ["g", "fbgroup", "Community", 0, 1], ...range(3).flatMap((i): B[] => [[`e${i}`, "emailone", `Day ${i + 1} email`, 1, i + 1], [`p${i}`, "vsl", `Day ${i + 1} page`, 2, i + 1]]), ["j", "checkout", "Join Today", 3, 3], ["t2", "thanks", "Thank You", 4, 3]],
    lines: [["s", "o"], ["o", "u"], ["u", "w"], ["w", "t"], ["t", "g", "flow", "b"], ["g", "e0"], ...range(2).map((i): L => [`e${i}`, `e${i + 1}`, "flow", "b"]), ...range(3).map((i): L => [`e${i}`, `p${i}`]), ["p2", "j"], ["j", "t2"]],
  },
  {
    key: "v2-vsl",
    n: 8,
    name: "Video Sales Letter Funnel",
    description: "Video sales page → Order form with bump → Upsell 1 (downsell) → Upsell 2 (downsell) → Thank You.",
    blocks: [["v", "vsl", "Video sales page", 0, 0], ["o", "checkout", "Order form + bump", 1, 0], ["u1", "upsell", "Upsell 1", 2, 0], ["d1", "downsell", "Downsell", 2, 1, true], ["u2", "upsell", "Upsell 2", 3, 0], ["d2", "downsell", "Downsell", 3, 1, true], ["t", "thanks", "Thank You", 4, 0]],
    lines: [["v", "o"], ["o", "u1"], ["u1", "u2"], ["u2", "t"], ["u1", "d1", "no", "b"], ["d1", "u2"], ["u2", "d2", "no", "b"], ["d2", "t"]],
  },
  {
    key: "v2-webinar",
    n: 9,
    name: "Webinar Funnel",
    description: "Opt-in → Form Completed → Registration Thank You. Confirmation Email → Attendance Emails 1–3 → Webinar Live → Watch Live. Replay Emails 1–3 → Webinar Replay → Watch Replay.",
    blocks: [
      ["o", "optin", "Opt-in", 0, 0],
      ["f", "formsub", "Form Completed", 1, 0],
      ["r", "thanks", "Registration Thank You", 2, 0],
      ["c", "emailone", "Confirmation Email", 3, 0],
      ...range(3).map((i): B => [`a${i}`, "emailone", `Attendance Email ${i + 1}`, i, 1]),
      ["l", "webinar", "Webinar Live", 3, 1],
      ["wl", "watch", "Watch Live", 4, 1],
      ...range(3).map((i): B => [`y${i}`, "emailone", `Replay Email ${i + 1}`, i, 2]),
      ["rp", "replay", "Webinar Replay", 3, 2],
      ["wr", "watch", "Watch Replay", 4, 2],
    ],
    lines: [["o", "f"], ["f", "r"], ["r", "c"], ["c", "a0", "flow", "b"], ["a0", "a1"], ["a1", "a2"], ["a2", "l"], ["l", "wl"], ["l", "y0", "no", "b"], ["y0", "y1"], ["y1", "y2"], ["y2", "rp"], ["rp", "wr"]],
  },
  {
    key: "v2-product-launch",
    n: 10,
    name: "Product Launch Funnel",
    description: "Opt-in → Thank You. Day 1–4 video pages fed by 5 emails → Join Today order (bump) → Thank You.",
    blocks: [["o", "optin", "Opt-in", 0, 0], ["t", "thanks", "Thank You", 1, 0], ...range(5).map((i): B => [`e${i}`, "emailone", `Email ${i + 1}`, i, 1]), ...range(4).map((i): B => [`p${i}`, "vsl", `Day ${i + 1} video`, i + 1, 2]), ["j", "checkout", "Join Today + bump", 5, 2], ["t2", "thanks", "Thank You", 6, 2]],
    lines: [["o", "t"], ["t", "e0", "flow", "b"], ...range(4).map((i): L => [`e${i}`, `e${i + 1}`]), ...range(4).map((i): L => [`e${i}`, `p${i}`, "flow", "b"]), ["p3", "j"], ["j", "t2"]],
  },
  {
    key: "v2-application",
    n: 11,
    name: "Application Funnel",
    description: "Offer Page → Application Form → Form Completed → Calendar → Schedule Meeting → Call Scheduled → Deal Proposal → Deal Won. Two schedule reminder emails loop back to the calendar.",
    blocks: [
      ["o", "sales", "Offer Page", 0, 0],
      ["a", "apply", "Application Form", 1, 0],
      ["f", "formsub", "Form Completed", 2, 0],
      ["c", "booking", "Calendar", 3, 0],
      ["s", "bookingmade", "Schedule Meeting", 4, 0],
      ["k", "customevent", "Call Scheduled", 5, 0],
      ["d", "customevent", "Deal Proposal", 6, 0],
      ["w", "won", "Deal Won", 7, 0],
      ["r1", "emailone", "Schedule Reminder 1", 4, 1],
      ["r2", "emailone", "Schedule Reminder 2", 5, 1],
    ],
    lines: [["o", "a"], ["a", "f"], ["f", "c"], ["c", "s"], ["s", "k"], ["k", "d"], ["d", "w"], ["s", "r1", "flow", "b"], ["r1", "r2"], ["r2", "c", "skip", "b"]],
  },
  {
    key: "v2-webinar-application",
    n: 12,
    name: "Webinar Application Funnel",
    description: "Save-your-spot Opt-in → Thank You → Web Class → Application page (video, questions, CTA) → What's Next (booking).",
    blocks: [["o", "optin", "Save-your-spot Opt-in", 0, 0], ["t", "thanks", "Thank You", 1, 0], ["w", "webinar", "Web Class", 2, 0], ["a", "apply", "Application page", 3, 0], ["n", "booking", "What's Next (booking)", 4, 0]],
    lines: [["o", "t"], ["t", "w"], ["w", "a"], ["a", "n"]],
  },
  {
    key: "v2-mini-class",
    n: 13,
    name: "Mini Class Funnel",
    description: "Opt-in → Form Completed → Registration Thank You. Video Emails 1–3 → Video pages 1–3 → Watch Video events.",
    blocks: [["o", "optin", "Opt-in", 0, 0], ["f", "formsub", "Form Completed", 1, 0], ["r", "thanks", "Registration Thank You", 2, 0], ...range(3).map((i): B => [`e${i}`, "emailone", `Video Email ${i + 1}`, i, 1]), ...range(3).map((i): B => [`p${i}`, "vsl", `Video page ${i + 1}`, i + 1, 2]), ...range(3).map((i): B => [`w${i}`, "watch", `Watch Video ${i + 1}`, i + 2, 3])],
    lines: [["o", "f"], ["f", "r"], ["r", "e0", "flow", "b"], ["e0", "e1"], ["e1", "e2"], ...range(3).map((i): L => [`e${i}`, `p${i}`, "flow", "b"]), ...range(3).map((i): L => [`p${i}`, `w${i}`])],
  },
];

export const TEMPLATE13_BY_KEY: Record<string, Template13> = Object.fromEntries(TEMPLATES13.map((t) => [t.key, t]));

/** Example traffic for "sample numbers": one source feeding the first step (not counted as a template block). */
export const SAMPLE_SOURCE = { type: "fbads", name: "Example traffic", p: { model: "budget", visitors: 2000, spend: 600 } as NodeParams };

export interface Template13Options {
  /** Zero traffic, rates and prices, no example source. */
  empty?: boolean;
  /** Per template block id: a new name, a page URL, a captured screenshot path. */
  names?: Record<string, string>;
  urls?: Record<string, string>;
  shots?: Record<string, string>;
  /** Prefix for node ids (unique per insertion). */
  prefix?: string;
}

const ZERO: NodeParams = { cr: 0, price: 0, visitors: 0, spend: 0, clicks: 0, impr: 0, costPer: 0 };

/** Builds a template's graph at the origin. Blocks on a row are centre-aligned so lines stay straight. */
export function template13Graph(key: string, o: Template13Options = {}): FunnelGraph {
  const t = TEMPLATE13_BY_KEY[key];
  if (!t) throw new Error(`Unknown template ${key}`);
  const pre = o.prefix ?? key;
  // blocks sit on the 240 x 200 pitch and are aligned on their picture centre, so the lines on a row stay straight
  const rowPivot = (r: number) => Math.max(...t.blocks.filter((b) => b[4] === r).map((b) => blockPivot(b[1])));
  const nodes: FunnelNode[] = t.blocks.map(([id, type, name, c, r, optional]) => {
    const T = typeOf(type);
    const p: NodeParams = { ...defaultsFor(type), ...(o.empty ? Object.fromEntries(Object.keys(ZERO).filter((k) => k in defaultsFor(type)).map((k) => [k, 0])) : {}) };
    const n: FunnelNode = { id: `${pre}-${id}`, type, name: o.names?.[id]?.trim() || name || T.label, x: 260 + c * PITCH.x, y: 40 + r * PITCH.y + (rowPivot(r) - blockPivot(type)), p };
    if (optional) n.s = { borderStyle: "dashed" };
    if (optional) n.p.optional = true;
    if (o.urls?.[id]?.trim()) n.url = o.urls[id].trim();
    if (o.shots?.[id]) n.shot = o.shots[id];
    return n;
  });
  const edges: FunnelEdge[] = t.lines.map(([a, b, kind, side], i) => {
    const e: FunnelEdge = { id: `${pre}-e${i}`, from: `${pre}-${a}`, to: `${pre}-${b}`, share: 100, port: kind === "no" ? "alt" : "main" };
    if (side === "b") e.sh = "bottom" as Side;
    if (kind === "skip") e.s = { kind: "skip" };
    return e;
  });
  if (!o.empty) {
    // the example traffic source feeds the first block (column 0, top row)
    const first = t.blocks.slice().sort((x, y) => x[3] - y[3] || x[4] - y[4])[0];
    const fn = nodes.find((n) => n.id === `${pre}-${first[0]}`)!;
    nodes.unshift({ id: `${pre}-src`, type: SAMPLE_SOURCE.type, name: SAMPLE_SOURCE.name, x: 20, y: fn.y + blockPivot(fn.type) - blockPivot(SAMPLE_SOURCE.type), p: { ...defaultsFor(SAMPLE_SOURCE.type), ...SAMPLE_SOURCE.p } });
    edges.unshift({ id: `${pre}-esrc`, from: `${pre}-src`, to: fn.id, share: 100, port: "main" });
  }
  return { nodes, edges, view: { x: 60, y: 40, k: 1 } };
}

/** The template's pages (for the customize form: a name and a URL each). */
export const templatePages = (key: string) => (TEMPLATE13_BY_KEY[key]?.blocks ?? []).filter(([, type]) => typeOf(type)?.cat === "page").map(([id, type, name]) => ({ id, type, name }));
