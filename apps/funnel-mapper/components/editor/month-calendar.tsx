"use client";
// Two-month range picker (V2 "V2-month-calendar"): pick the first day, then the last; days that already have saved
// actuals carry a dot (never colour alone: the dot is also announced in the day's label).
import { useState } from "react";
import { Icon } from "@/components/icon";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function MonthCalendar({ range, marked, onPick }: { range: { start: string; end: string }; marked: { start: string; end: string }[]; onPick: (r: { start: string; end: string }) => void }) {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date(range.end + "T00:00:00Z");
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() - 1 };
  });
  const [first, setFirst] = useState<string | null>(null);
  const has = (day: string) => marked.some((p) => p.start <= day && day <= p.end);
  const month = (y: number, m: number) => {
    const d0 = new Date(Date.UTC(y, m, 1));
    const yy = d0.getUTCFullYear(),
      mm = d0.getUTCMonth();
    const n = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    const lead = (d0.getUTCDay() + 6) % 7;
    return (
      <div className="fm-cal-m" key={`${yy}-${mm}`}>
        <b>{d0.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
        <div className="fm-cal-g" role="grid" aria-label={d0.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}>
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
            <span key={`h${i}`} className="w" aria-hidden="true">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`l${i}`} />
          ))}
          {Array.from({ length: n }, (_, i) => {
            const day = iso(yy, mm, i + 1);
            const sel = first ? day === first : range.start <= day && day <= range.end;
            const dot = has(day);
            return (
              <button
                key={day}
                type="button"
                className={`${sel ? "sel" : ""}${dot ? " dot" : ""}`}
                aria-pressed={sel}
                aria-label={`${new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}${dot ? ", has actuals" : ""}`}
                onClick={() => {
                  if (!first) setFirst(day);
                  else {
                    onPick(first <= day ? { start: first, end: day } : { start: day, end: first });
                    setFirst(null);
                  }
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="fm-cal">
      <div className="flex items-center justify-between">
        <button type="button" className="btn icon sm" aria-label="Earlier months" onClick={() => setAnchor((a) => ({ y: a.y, m: a.m - 1 }))}>
          <Icon name="chevronLeft" size={14} />
        </button>
        <small className="text-muted">{first ? "Now pick the last day" : "Pick the first day"}</small>
        <button type="button" className="btn icon sm" aria-label="Later months" onClick={() => setAnchor((a) => ({ y: a.y, m: a.m + 1 }))}>
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div className="fm-cal-2">
        {month(anchor.y, anchor.m)}
        {month(anchor.y, anchor.m + 1)}
      </div>
    </div>
  );
}
