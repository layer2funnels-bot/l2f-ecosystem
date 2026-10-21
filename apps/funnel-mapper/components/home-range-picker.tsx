"use client";
// Home date range picker (V2 F5, "V2-home-date-range"): presets plus a custom from / to month with a month grid.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RANGE_PRESETS, type RangeKey } from "@/lib/home-range";
import { Icon } from "./icon";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function HomeRangePicker({ current, label, from, to }: { current: RangeKey; label: string; from: string; to: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(current === "custom");
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  const [year, setYear] = useState(Number(to.slice(0, 4)));
  const [picking, setPicking] = useState<"from" | "to">("from");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const go = (k: RangeKey, f?: string, t?: string) => {
    setOpen(false);
    router.push(k === "month" ? "/" : k === "custom" ? `/?range=custom&from=${f}&to=${t}` : `/?range=${k}`, { scroll: false });
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="calendar" size={16} /> {label}
      </button>
      {open && (
        <div className="fm-rangepop card" role="dialog" aria-label="Date range">
          <div className="grid gap-1" role="group" aria-label="Presets">
            {RANGE_PRESETS.map(([k, l]) => (
              <button key={k} type="button" className="fm-rangeopt" aria-pressed={k === "custom" ? custom : !custom && current === k} onClick={() => (k === "custom" ? setCustom(true) : go(k))}>
                {l}
              </button>
            ))}
          </div>
          {custom && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <button type="button" className={`btn sm${picking === "from" ? " primary" : ""}`} onClick={() => setPicking("from")}>
                  From {a}
                </button>
                <button type="button" className={`btn sm${picking === "to" ? " primary" : ""}`} onClick={() => setPicking("to")}>
                  To {b}
                </button>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <button type="button" className="btn icon sm" aria-label="Previous year" onClick={() => setYear((y) => y - 1)}>
                  <Icon name="chevronLeft" size={14} />
                </button>
                <b className="font-display">{year}</b>
                <button type="button" className="btn icon sm" aria-label="Next year" onClick={() => setYear((y) => y + 1)}>
                  <Icon name="chevronRight" size={14} />
                </button>
              </div>
              <div className="fm-monthgrid" role="grid" aria-label={`Months of ${year}`}>
                {MONTHS.map((m, i) => {
                  const v = `${year}-${String(i + 1).padStart(2, "0")}`;
                  const inside = v >= (a <= b ? a : b) && v <= (a <= b ? b : a);
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={v === a || v === b}
                      className={inside ? "in" : ""}
                      aria-label={`${m} ${year}`}
                      onClick={() => {
                        if (picking === "from") {
                          setA(v);
                          setPicking("to");
                        } else setB(v);
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn primary mt-3 w-full" onClick={() => go("custom", a <= b ? a : b, a <= b ? b : a)}>
                Show this range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
