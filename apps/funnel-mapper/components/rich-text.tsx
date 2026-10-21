"use client";
// Renders lib/rich-text's tree as React elements (never as HTML), plus a field with a formatting toolbar.
import { useId, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/icon";
import { alignLines, hostOf, parseRich, prefixLines, safeUrl, wrapSel, type Align, type Inline, type Sel } from "@/lib/rich-text";

function Inl({ c }: { c: Inline[] }) {
  return (
    <>
      {c.map((x, i) => {
        if (x.t === "text") return <span key={i}>{x.v}</span>;
        if (x.t === "a")
          return (
            <a key={i} href={x.href} target="_blank" rel="noopener noreferrer nofollow" className="nodrag" onClick={(e) => e.stopPropagation()}>
              <Inl c={x.c} />
            </a>
          );
        const Tag = { b: "strong", i: "em", u: "u", s: "s" }[x.t] as "strong";
        return (
          <Tag key={i}>
            <Inl c={x.c} />
          </Tag>
        );
      })}
    </>
  );
}

const ta = (a: Align): CSSProperties | undefined => (a === "left" ? undefined : { textAlign: a });

/** Read-only rendering of a rich-text note. */
export function RichText({ text, className, style, empty }: { text: string; className?: string; style?: CSSProperties; empty?: React.ReactNode }) {
  const blocks = parseRich(text);
  if (!blocks.length) return empty ? <div className={className}>{empty}</div> : <div className={className} style={style} />;
  return (
    <div className={`fm-rich ${className ?? ""}`} style={style}>
      {blocks.map((b, i) => {
        if (b.t === "h") {
          const H = (["h3", "h4", "h5"] as const)[b.level - 1];
          return (
            <H key={i} style={ta(b.align)}>
              <Inl c={b.c} />
            </H>
          );
        }
        if (b.t === "p")
          return (
            <p key={i} style={ta(b.align)}>
              {b.lines.map((l, k) => (
                <span key={k}>
                  {k > 0 && <br />}
                  <Inl c={l} />
                </span>
              ))}
            </p>
          );
        if (b.t === "li")
          return (
            <div key={i} className="rli" style={{ paddingLeft: b.depth * 16 }}>
              <span className="rmark" aria-hidden="true">
                {b.check !== undefined ? (b.check ? "☑" : "☐") : b.ordered ? `${b.n}.` : "•"}
              </span>
              <span className={b.check ? "rdone" : undefined}>
                {b.check !== undefined && <span className="sr-only">{b.check ? "Done: " : "To do: "}</span>}
                <Inl c={b.c} />
              </span>
            </div>
          );
        if (b.t === "img")
          // eslint-disable-next-line @next/next/no-img-element -- user-provided https images in notes
          return <img key={i} src={b.src} alt={b.alt} className="rimg" loading="lazy" referrerPolicy="no-referrer" draggable={false} />;
        return (
          <a key={i} className="rvideo nodrag" href={b.url} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
            <Icon name="play" size={16} /> Video · {hostOf(b.url)}
          </a>
        );
      })}
    </div>
  );
}

type Tool = { label: string; icon?: string; text?: string; run: (s: Sel) => Sel };
const TOOLS: Tool[][] = [
  [
    { label: "Heading", text: "H1", run: (s) => prefixLines(s, "# ") },
    { label: "Subheading", text: "H2", run: (s) => prefixLines(s, "## ") },
  ],
  [
    { label: "Bold", text: "B", run: (s) => wrapSel(s, "**") },
    { label: "Italic", text: "I", run: (s) => wrapSel(s, "*") },
    { label: "Underline", text: "U", run: (s) => wrapSel(s, "++") },
    { label: "Strikethrough", text: "S", run: (s) => wrapSel(s, "~~") },
  ],
  [
    { label: "Bulleted list", text: "•", run: (s) => prefixLines(s, "- ") },
    { label: "Numbered list", text: "1.", run: (s) => prefixLines(s, (i) => `${i + 1}. `) },
    { label: "To-do list", text: "☐", run: (s) => prefixLines(s, "- [ ] ") },
  ],
  [
    { label: "Align left", text: "⇤", run: (s) => alignLines(s, "left") },
    { label: "Centre", text: "↔", run: (s) => alignLines(s, "center") },
    { label: "Align right", text: "⇥", run: (s) => alignLines(s, "right") },
  ],
];

/** Text field with a formatting toolbar and a preview. Stores the Markdown-style source. */
export function RichTextField({ label, value, onChange, help, placeholder, rows = 6, disabled }: { label: React.ReactNode; value: string; onChange: (v: string) => void; help?: React.ReactNode; placeholder?: string; rows?: number; disabled?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const apply = (f: (s: Sel) => Sel) => {
    const el = ref.current;
    if (!el) return;
    const r = f({ text: el.value, start: el.selectionStart, end: el.selectionEnd });
    onChange(r.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const addLink = () => {
    const url = safeUrl(window.prompt("Link address (https://…)") ?? "");
    if (!url) return;
    apply((s) => {
      const label = s.text.slice(s.start, s.end) || "link";
      const ins = `[${label}](${url})`;
      return { text: s.text.slice(0, s.start) + ins + s.text.slice(s.end), start: s.start + 1, end: s.start + 1 + label.length };
    });
  };
  const addImage = () => {
    const url = safeUrl(window.prompt("Image or video address (https://…)") ?? "");
    if (!url) return;
    apply((s) => {
      const before = s.text.slice(0, s.start);
      const ins = `${before && !before.endsWith("\n") ? "\n" : ""}${/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(url) ? `![](${url})` : url}\n`;
      return { text: before + ins + s.text.slice(s.end), start: s.start + ins.length, end: s.start + ins.length };
    });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    const map: Record<string, string> = { b: "**", i: "*", u: "++" };
    if (map[k]) {
      e.preventDefault();
      e.stopPropagation();
      apply((s) => wrapSel(s, map[k]));
    }
  };
  return (
    <div className="field fm-richfield">
      <div className="flex items-center justify-between gap-2">
        <label className="lbl" htmlFor={id}>
          {label}
        </label>
        <div className="seg sm" role="group" aria-label="Note view">
          <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
            Write
          </button>
          <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
            Preview
          </button>
        </div>
      </div>
      {preview ? (
        <div className="fm-richpreview">
          <RichText text={value} empty={<span className="text-muted">Nothing written yet.</span>} />
        </div>
      ) : (
        <>
          {!disabled && (
            <div className="fm-richbar" role="toolbar" aria-label="Formatting" aria-controls={id}>
              {TOOLS.map((grp, gi) => (
                <span key={gi} className="grp">
                  {grp.map((t) => (
                    <button key={t.label} type="button" title={t.label} aria-label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(t.run)} className={`t-${t.text === "B" ? "b" : t.text === "I" ? "i" : t.text === "U" ? "u" : t.text === "S" ? "s" : "x"}`}>
                      {t.text}
                    </button>
                  ))}
                </span>
              ))}
              <span className="grp">
                <button type="button" title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
                  <Icon name="link" size={14} />
                </button>
                <button type="button" title="Image or video" aria-label="Image or video" onMouseDown={(e) => e.preventDefault()} onClick={addImage}>
                  <Icon name="image" size={14} />
                </button>
              </span>
            </div>
          )}
          <textarea ref={ref} id={id} className="input fm-richarea" rows={rows} value={value} placeholder={placeholder} disabled={disabled} onKeyDown={onKey} onChange={(e) => onChange(e.target.value)} />
        </>
      )}
      {help && <span className="help">{help}</span>}
    </div>
  );
}
