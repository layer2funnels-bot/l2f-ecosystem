// Wait / Delay: a duration in minutes, hours, days or weeks. The funnel maths is unaffected (the engine never reads
// the duration; everyone who arrives leaves). Storage stays compatible with older funnels: `p.days` is always kept in
// sync (in days), and `p.dur` + `p.unit` carry what the user typed. Funnels without them read as `days` days.
import type { NodeParams } from "./catalog";

export const WAIT_UNITS = [
  ["min", "Min", 1 / 1440],
  ["hr", "Hrs", 1 / 24],
  ["day", "Days", 1],
  ["wk", "Wks", 7],
] as const;
export type WaitUnit = (typeof WAIT_UNITS)[number][0];

const PER_DAY: Record<WaitUnit, number> = { min: 1 / 1440, hr: 1 / 24, day: 1, wk: 7 };
const WORD: Record<WaitUnit, [string, string]> = { min: ["minute", "minutes"], hr: ["hour", "hours"], day: ["day", "days"], wk: ["week", "weeks"] };

const isUnit = (u: unknown): u is WaitUnit => typeof u === "string" && u in PER_DAY;

/** What the user entered: duration (NaN when blank) and unit. Falls back to the legacy `days` value. */
export function waitOf(p: NodeParams): { n: number; unit: WaitUnit } {
  if (isUnit(p.unit) && p.dur !== undefined && p.dur !== null && p.dur !== "") return { n: Number(p.dur), unit: p.unit };
  if (p.dur === "") return { n: NaN, unit: isUnit(p.unit) ? p.unit : "day" };
  return { n: Number(p.days ?? 0), unit: "day" };
}

/** Params patch that stores a duration + unit and keeps `days` in sync. */
export function waitPatch(n: number, unit: WaitUnit): NodeParams {
  const ok = Number.isFinite(n) && n >= 0;
  return { dur: ok ? n : "", unit, days: ok ? Math.round(n * PER_DAY[unit] * 1e6) / 1e6 : 0 };
}

export const waitValid = (p: NodeParams) => {
  const { n } = waitOf(p);
  return Number.isFinite(n) && n > 0;
};

/** "Wait 2 days", "Wait 1 hour"; "Wait (set a duration)" when blank or zero. */
export function waitLabel(p: NodeParams): string {
  const { n, unit } = waitOf(p);
  if (!Number.isFinite(n) || n <= 0) return "Wait (set a duration)";
  const num = n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  return `Wait ${num} ${WORD[unit][n === 1 ? 0 : 1]}`;
}
