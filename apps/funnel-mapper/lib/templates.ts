// Built-in templates, ported from the prototype's template() function.
import { defaultsFor, typeOf, type NodeParams } from "./catalog";
import { blankSettings, type FunnelEdge, type FunnelGraph, type FunnelNode, type FunnelSettings } from "./graph";
import { TEMPLATE13_BY_KEY, TEMPLATES13, template13Graph } from "./templates13";

type NodeSpec = [key: string, type: string, name: string, x: number, y: number, p?: NodeParams, extra?: Partial<FunnelNode>];
type EdgeSpec = [from: string, to: string, port?: "main" | "alt", share?: number];

export interface BuiltinTemplate {
  key: string;
  name: string;
  category: string;
  description: string;
  graph: FunnelGraph;
  settings: FunnelSettings;
}

/** Builds a template graph. Ids are `${prefix}-${key}` so they are stable (tests, fixtures) and unique per template. */
export function tpl(prefix: string, list: NodeSpec[], edges: EdgeSpec[]): FunnelGraph {
  const ids: Record<string, string> = {};
  const nodes: FunnelNode[] = list.map(([key, type, nm, x, y, p, extra]) => {
    const id = `${prefix}-${key}`;
    ids[key] = id;
    return { id, type, name: nm || typeOf(type).label, x, y, p: { ...defaultsFor(type), ...(p || {}) }, ...(extra || {}) };
  });
  const es: FunnelEdge[] = edges.map(([a, b, port, share], i) => ({ id: `${prefix}-e${i}`, from: ids[a], to: ids[b], port: port || "main", share: share ?? 100 }));
  return { nodes, edges: es, view: { x: 60, y: 40, k: 1 } };
}

const DEFS: Record<string, { name: string; category: string; description: string; build: () => FunnelGraph }> = {
  tripwire: {
    name: "PT tripwire funnel",
    category: "Tripwire",
    description: "Ads and a QR poster into a fitness quiz, a low-ticket Kickstart, then monthly coaching with a WhatsApp downsell.",
    build: () =>
      tpl(
        "tripwire",
        [
          ["fr1", "frame", "Get attention", 10, 20, { color: "#2563EB" }, { w: 270, h: 420 }],
          ["fr2", "frame", "Convert", 300, 20, { color: "#6D3FD9" }, { w: 840, h: 640 }],
          ["ig", "igads", "Instagram ads", 40, 80, { model: "budget", visitors: 2000, spend: 600 }],
          ["po", "poster", "Gym poster QR", 40, 290, { visitors: 300, spend: 60 }],
          ["qz", "quizp", "Fitness quiz", 330, 180, { cr: 45 }],
          ["ck", "checkout", "6-Week Kickstart", 600, 180, { cr: 8, price: 37, newc: true }],
          ["cd", "cond", "Joined coaching?", 880, 180, { pct: 35 }],
          ["mb", "sub", "Monthly coaching", 1180, 80, { cr: 100, price: 109.99, interval: "monthly", life: 6 }],
          ["fu", "follow", "WhatsApp follow-up", 600, 420, { cr: 40 }],
          ["ds", "downsell", "Kickstart (£27 offer)", 880, 420, { cr: 12, price: 27, newc: true }],
          ["nt", "note", "", 1180, 300, { text: "Kickstart buyers get £37 credited if they join monthly coaching within 6 weeks." }],
        ],
        [["ig", "qz"], ["po", "qz"], ["qz", "ck"], ["ck", "cd"], ["cd", "mb"], ["ck", "fu", "alt"], ["fu", "ds"]],
      ),
  },
  quiz: {
    name: "Quiz → trial funnel",
    category: "Lead generation",
    description: "Organic and paid traffic into a quiz, a 7-day free trial, then paid membership with call and email recovery paths.",
    build: () =>
      tpl(
        "quiz",
        [
          ["tr", "igorg", "Instagram traffic", 40, 100, { visitors: 1500 }],
          ["fb", "fbads", "Facebook ads", 40, 300, { visitors: 1000, spend: 450 }],
          ["qz", "quizp", "Quiz funnel", 320, 200, { cr: 40 }],
          ["tl", "trial", "7-day free trial", 600, 200, { cr: 15 }],
          ["c1", "cond", "Converted to paid?", 880, 200, { pct: 40 }],
          ["pm", "sub", "Paid membership", 1160, 100, { cr: 100, price: 69.99, newc: true, life: 5 }],
          ["cl", "call", "Free call", 1160, 330, { cr: 60 }],
          ["c2", "cond", "Joined after call?", 1440, 330, { pct: 35 }],
          ["pm2", "sub", "Membership (after call)", 1720, 250, { cr: 100, price: 69.99, newc: true, life: 5 }],
          ["fu", "seq", "Follow-up emails", 600, 460, { cr: 20, count: 4 }],
          ["dm", "sub", "Discounted membership", 880, 460, { cr: 6, price: 49.99, newc: true, life: 4 }],
        ],
        [["tr", "qz"], ["fb", "qz"], ["qz", "tl"], ["tl", "c1"], ["c1", "pm"], ["c1", "cl", "alt"], ["cl", "c2"], ["c2", "pm2"], ["tl", "fu", "alt"], ["fu", "dm"]],
      ),
  },
  webinar: {
    name: "Webinar funnel",
    category: "Webinar",
    description: "CPM ads into webinar registration, reminders, a live webinar and replay, then checkout with bump and VIP upsell.",
    build: () =>
      tpl(
        "webinar",
        [
          ["fb", "fbads", "Facebook ads", 40, 200, { model: "cpm", impr: 200000, cpm: 9, ctr: 1.2 }],
          ["op", "optin", "Webinar registration", 320, 200, { cr: 30 }],
          ["ty", "thanks", "Thank-you page", 600, 60, { cr: 100 }],
          ["rm", "seq", "Reminder emails", 600, 300, { cr: 55, count: 4 }],
          ["wb", "webinar", "Live webinar", 880, 300, { cr: 30 }],
          ["ck", "checkout", "Program checkout", 1160, 300, { cr: 8, price: 997, newc: true }],
          ["bp", "bump", "Workbook bump", 1440, 180, { cr: 30, price: 47 }],
          ["up", "upsell", "VIP upgrade", 1440, 420, { cr: 15, price: 497 }],
          ["rp", "replay", "Replay", 880, 520, { cr: 10 }],
        ],
        [["fb", "op"], ["op", "ty"], ["op", "rm"], ["rm", "wb"], ["wb", "ck"], ["ck", "bp"], ["ck", "up"], ["rm", "rp", "alt"], ["rp", "ck"]],
      ),
  },
  call: {
    name: "Application → call funnel",
    category: "High ticket",
    description: "LinkedIn CPC ads into a VSL, application, qualification, booking and strategy call, closing a 3-payment program.",
    build: () =>
      tpl(
        "call",
        [
          ["li", "liads", "LinkedIn ads", 40, 200, { model: "cpc", clicks: 600, cpc: 4 }],
          ["vs", "vsl", "VSL page", 320, 200, { cr: 15 }],
          ["ap", "apply", "Application", 600, 200, { cr: 60 }],
          ["q", "cond", "Qualified?", 880, 200, { pct: 50 }],
          ["bk", "booking", "Booking calendar", 1160, 120, { cr: 70 }],
          ["cl", "call", "Strategy call", 1440, 120, { cr: 75, costPer: 25 }],
          ["c2", "cond", "Closed?", 1720, 120, { pct: 25 }],
          ["ht", "plan", "Coaching (3 payments)", 2000, 40, { cr: 100, price: 1000, pays: 3, newc: true }],
          ["nq", "delivery", "Free guide", 1160, 380, { cr: 100 }],
        ],
        [["li", "vs"], ["vs", "ap"], ["ap", "q"], ["q", "bk"], ["bk", "cl"], ["cl", "c2"], ["c2", "ht"], ["q", "nq", "alt"]],
      ),
  },
  sub: {
    name: "Subscription + A/B test",
    category: "Subscription",
    description: "TikTok CPM ads split between two landing pages into an app subscription with a 7-day trial and a yearly upsell.",
    build: () =>
      tpl(
        "sub",
        [
          ["tt", "ttads", "TikTok ads", 40, 200, { model: "cpm", impr: 150000, cpm: 6, ctr: 1 }],
          ["sp", "split", "Landing page test", 320, 200, { pct: 50 }],
          ["la", "landing", "Page A: video", 600, 100, { cr: 12 }],
          ["lb", "landing", "Page B: long copy", 600, 320, { cr: 9 }],
          ["ck", "sub", "App subscription", 900, 210, { cr: 30, price: 14.99, interval: "monthly", trialDays: 7, trialPrice: 0, life: 8, newc: true }],
          ["yr", "upsell", "Switch to yearly", 1180, 120, { cr: 15, price: 99 }],
        ],
        [["tt", "sp"], ["sp", "la"], ["sp", "lb", "alt"], ["la", "ck"], ["lb", "ck"], ["ck", "yr"]],
      ),
  },
};

export const BUILTIN_KEYS = Object.keys(DEFS);

export function builtinTemplate(key: string): BuiltinTemplate {
  const t13 = TEMPLATE13_BY_KEY[key];
  if (t13) return { key, name: t13.name, category: "Built-in", description: t13.description, graph: template13Graph(key), settings: blankSettings("GBP") };
  const d = DEFS[key];
  if (!d) throw new Error(`Unknown template ${key}`);
  return { key, name: d.name, category: d.category, description: d.description, graph: d.build(), settings: blankSettings("GBP") };
}

export const builtinTemplates = (): BuiltinTemplate[] => BUILTIN_KEYS.map(builtinTemplate);
/** The approved V2 template library (13, in the owner's order). The earlier five built-ins stay resolvable for saved links and tests. */
export const APPROVED_TEMPLATE_KEYS = TEMPLATES13.map((t) => t.key);

/** Give every node and edge a fresh id (when instantiating a template or duplicating a funnel). */
export function reidGraph(g: FunnelGraph, newId: () => string): FunnelGraph {
  const map: Record<string, string> = {};
  const nodes = g.nodes.map((n) => {
    const id = newId();
    map[n.id] = id;
    return { ...structuredClone(n), id };
  });
  const edges = g.edges.filter((e) => map[e.from] && map[e.to]).map((e) => ({ ...e, id: "e" + newId(), from: map[e.from], to: map[e.to] }));
  return { nodes, edges, view: { ...g.view } };
}
