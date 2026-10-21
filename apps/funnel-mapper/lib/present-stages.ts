// Presentation stages. With stage frames on the map, each frame is a stage (named as the frame is). Without frames the
// funnel is split into Acquire (traffic sources), Convert (pages, offers and decisions) and Finish (follow-up, goals).
// A stage's numbers come from frameTotals(), the same function that labels frames on the Performance map, so the
// presentation and the map always agree.
import { isAnnot, typeOf } from "./catalog";
import { frameTotals, type FrameTotals } from "./editor/labels";
import type { FunnelResult } from "./funnel-math";
import { frameMembersOf } from "./geometry";
import type { FunnelNode } from "./graph";

export interface Stage {
  key: string;
  name: string;
  ids: string[];
  totals: FrameTotals;
}

const AUTO: { key: string; name: string; test: (cat: string, base: string) => boolean }[] = [
  { key: "acquire", name: "Acquire", test: (c) => c === "traffic" },
  { key: "convert", name: "Convert", test: (c) => c === "page" || c === "offer" || c === "logic" },
  { key: "finish", name: "Finish", test: (c) => c === "action" },
];

export function presentStages(nodes: FunnelNode[], R: FunnelResult, cur: string, k = 1): Stage[] {
  const flow = nodes.filter((n) => typeOf(n.type) && !isAnnot(n.type));
  const frames = nodes.filter((n) => n.type === "frame").sort((a, b) => a.x - b.x || a.y - b.y);
  const framed = frames.map((f) => ({ f, members: frameMembersOf(f, nodes) })).filter((x) => x.members.length > 0);
  if (framed.length)
    return framed.map(({ f, members }) => ({ key: f.id, name: f.name || "Stage", ids: members.map((m) => m.id), totals: frameTotals(members, R, cur, k) }));
  return AUTO.map((a) => {
    const members = flow.filter((n) => a.test(typeOf(n.type).cat, n.type));
    return { key: a.key, name: a.name, ids: members.map((m) => m.id), totals: frameTotals(members, R, cur, k) };
  }).filter((s) => s.ids.length > 0);
}
