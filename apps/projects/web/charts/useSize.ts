import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/** Width of an element in whole pixels, kept current with a ResizeObserver. The charts redraw their viewBox from it. */
export function useWidth<T extends HTMLElement>(fallback = 320): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setWidth(w); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref as RefObject<T>, width];
}
