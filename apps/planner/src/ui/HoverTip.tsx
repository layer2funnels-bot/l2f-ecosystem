// One hover helper for the whole app: any element with data-tip shows a small explanation next to the pointer
// (charts, progress bars, map cards), like Cascade's chart hovers. Keyboard users get the same text from focus.
import { useEffect, useState } from 'react';

export function HoverTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest('[data-tip]') : null);
    const move = (e: MouseEvent) => { const el = find(e.target); const text = el?.getAttribute('data-tip'); setTip(text ? { text, x: e.clientX, y: e.clientY } : null); };
    const focus = (e: FocusEvent) => { const el = find(e.target); const text = el?.getAttribute('data-tip'); if (el && text) { const r = el.getBoundingClientRect(); setTip({ text, x: r.left + r.width / 2, y: r.top }); } };
    const hide = () => setTip(null);
    document.addEventListener('mousemove', move); document.addEventListener('focusin', focus); document.addEventListener('focusout', hide); window.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', hide); window.removeEventListener('scroll', hide, true); };
  }, []);
  if (!tip) return null;
  const left = Math.min(tip.x + 14, window.innerWidth - 280);
  return <div className="hovertip" role="tooltip" style={{ left, top: Math.max(8, tip.y - 44) }}>{tip.text}</div>;
}