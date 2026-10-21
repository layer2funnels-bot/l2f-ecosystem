"use client";
import { useId, useState } from "react";

/** Numeric input bound to an external value; keeps the raw text while focused so "1." or "" can be typed. */
export function NumInput({ value, onChange, min, max, step = "any", id, className = "input", ...rest }: { value: number | undefined; onChange: (v: number) => void; min?: number; max?: number; step?: string | number; id?: string; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max">) {
  const [draft, setDraft] = useState<string | null>(null);
  const v = Number.isFinite(value) ? String(value) : "";
  return (
    <input
      {...rest}
      id={id}
      className={className}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={draft ?? v}
      onFocus={() => setDraft(v)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

export function Field({ label, help, children, id }: { label: React.ReactNode; help?: React.ReactNode; children: (id: string) => React.ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      {children(fid)}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

export function NumField({ label, value, onChange, help, min, max }: { label: React.ReactNode; value: number | undefined; onChange: (v: number) => void; help?: React.ReactNode; min?: number; max?: number }) {
  return <Field label={label} help={help}>{(id) => <NumInput id={id} value={value} onChange={onChange} min={min} max={max} />}</Field>;
}

export function TextField({ label, value, onChange, help, placeholder, type = "text", multiline }: { label: React.ReactNode; value: string; onChange: (v: string) => void; help?: React.ReactNode; placeholder?: string; type?: string; multiline?: boolean }) {
  return (
    <Field label={label} help={help}>
      {(id) =>
        multiline ? (
          <textarea id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={id} className="input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

export function Seg<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** A row of figures (V2: label above a Bricolage value). With `title` it becomes a titled section ("Flow this month"). */
export function StatBox({ items, title, children }: { items: [string, React.ReactNode][]; title?: string; children?: React.ReactNode }) {
  const box = (
    <div className="statbox" aria-live="polite">
      {items.map(([a, b]) => (
        <div key={a}>
          {a}
          <b>{b}</b>
        </div>
      ))}
    </div>
  );
  if (!title) return box;
  return (
    <section className="fm-flowsec">
      <div className="fm-sh">
        <h4>{title}</h4>
      </div>
      {box}
      {children}
    </section>
  );
}
