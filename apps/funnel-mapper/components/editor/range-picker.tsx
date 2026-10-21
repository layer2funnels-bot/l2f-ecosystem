"use client";
// One calendar for the numbers on the map (V3 "Plan control and calendar"): presets and a two-month range picker. In Plan the numbers
// scale to the length of the range (see lib/range.ts); in Actual they are the real entries for those dates, and days that have
// entries carry a dot. Display only: nothing here touches the maths.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { isoDate, monthRange, presetOf, rangeDays, rangeLabel, RANGE_PRESETS, type DateRange } from "@/lib/range";
import { setRange, useEditor, viewRange } from "@/lib/editor/store";
import { ensureActuals } from "./assets";

const MS = 86_400_000;
const WEEK = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const monthName = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function Month({ y, m, draft, dots, onPick }: { y: number; m: number; draft: { start: string; end: string | null }; dots: Set<string>; onPick: (iso: string) => void }) {
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => isoDate(new Date(Date.UTC(y, m, i + 1))))];
  const lo = draft.end && draft.end < draft.start ? draft.end : draft.start;
  const hi = draft.end ? (draft.end < draft.start ? draft.start : draft.end) : draft.start;
  return (
    <div className="fm-cal-m">
      <div className="fm-cal-t">{monthName(y, m)}</div>
      <div className="fm-cal-g" role="grid" aria-label={monthName(y, m)}>
        {WEEK.map((d) => (
          <span key={d} className="fm-cal-w" role="columnheader">
            {d}
          </span>
        ))}
        {cells.map((iso, i) =>
          iso ? (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={`fm-cal-d${iso >= lo && iso <= hi ? " in" : ""}${iso === lo || iso === hi ? " end" : ""}`}
              aria-label={`${dayName(iso)}${dots.has(iso) ? ", has real entries" : ""}`}
              aria-selected={iso >= lo && iso <= hi}
              onClick={() => onPick(iso)}
            >
              {Number(iso.slice(8))}
              {dots.has(iso) && <i aria-hidden="true" />}
            </button>
          ) : (
            <span key={`b${i}`} />
          ),
        )}
      </div>
    </div>
  );
}

export function RangePicker() {
  const range = useEditor((s) => s.opts.range);
  const rows = useEditor((s) => s.actuals);
  const actual = useEditor((s) => !!s.actualView);
  const current = useMemo(() => viewRange({ range }), [range]);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null); // fixed, so the stage edge and the side panels never clip it
  const [draft, setDraft] = useState<{ start: string; end: string | null }>({ start: current.start, end: current.end });
  const [shown, setShown] = useState({ y: Number(current.start.slice(0, 4)), m: Number(current.start.slice(5, 7)) - 1 });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void ensureActuals();
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), ref.current?.querySelector<HTMLElement>(".fm-range-btn")?.focus());
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  // days that have real entries (weeks and months of actuals cover every day in them)
  const dots = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) {
      const a = new Date(`${r.period_start}T00:00:00Z`).getTime(),
        b = new Date(`${r.period_end}T00:00:00Z`).getTime();
      for (let t = a, n = 0; t <= b && n < 400; t += MS, n++) set.add(isoDate(new Date(t)));
    }
    return set;
  }, [rows]);
  const openIt = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt({ left: Math.max(12, Math.min(r.left, window.innerWidth - 652)), top: r.bottom + 8 });
    setDraft({ start: current.start, end: current.end });
    setShown({ y: Number(current.start.slice(0, 4)), m: Number(current.start.slice(5, 7)) - 1 });
    setOpen((o) => !o);
  };
  const pick = (iso: string) => setDraft((d) => (d.end || !d.start ? { start: iso, end: null } : iso < d.start ? { start: iso, end: d.start } : { start: d.start, end: iso }));
  const chosen: DateRange = { start: draft.end && draft.end < draft.start ? draft.end : draft.start, end: draft.end ? (draft.end < draft.start ? draft.start : draft.end) : draft.start };
  const apply = () => {
    const thisMonth = monthRange(new Date());
    setRange(chosen.start === thisMonth.start && chosen.end === thisMonth.end ? null : chosen);
    setOpen(false);
  };
  const step = (by: number) => setShown(({ y, m }) => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 }));
  const next = { y: shown.y + Math.floor((shown.m + 1) / 12), m: (shown.m + 1) % 12 };
  const today = new Date();
  const active = presetOf(chosen, today);
  return (
    <div className="fm-range" ref={ref}>
      <button type="button" className="fm-range-btn btn" aria-haspopup="dialog" aria-expanded={open} aria-label={`Dates: ${rangeLabel(current)}`} title={actual ? "The dates the real numbers cover" : "The dates the plan numbers cover"} onClick={openIt}>
        <Icon name="calendar" size={15} /> <span>{rangeLabel(current)}</span> <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="fm-range-pop" role="dialog" aria-label="Choose dates" style={at ? { left: at.left, top: at.top } : undefined}>
          <div className="fm-range-body">
            <ul className="fm-range-presets" aria-label="Quick ranges">
              {RANGE_PRESETS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={active === p.id ? "on" : ""}
                    onClick={() => {
                      const r = p.get(today);
                      setDraft({ start: r.start, end: r.end });
                      setShown({ y: Number(r.start.slice(0, 4)), m: Number(r.start.slice(5, 7)) - 1 });
                    }}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" className={active === null ? "on" : ""} onClick={() => setDraft({ start: draft.start, end: null })}>
                  Custom range
                </button>
              </li>
            </ul>
            <div className="fm-cal">
              <div className="fm-cal-nav">
                <button type="button" className="btn icon ghost" aria-label="Earlier months" onClick={() => step(-1)}>
                  <Icon name="chevronLeft" size={14} />
                </button>
                <button type="button" className="btn icon ghost" aria-label="Later months" onClick={() => step(1)}>
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
              <Month y={shown.y} m={shown.m} draft={draft} dots={dots} onPick={pick} />
              <Month y={next.y} m={next.m} draft={draft} dots={dots} onPick={pick} />
            </div>
          </div>
          <div className="fm-range-foot">
            <span>
              {rangeLabel(chosen)} · {rangeDays(chosen)} {rangeDays(chosen) === 1 ? "day" : "days"}
              {dots.size > 0 && (
                <>
                  {" "}
                  · <i className="fm-cal-key" aria-hidden="true" /> days with real entries
                </>
              )}
            </span>
            <span className="flex-1" />
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
