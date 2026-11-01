// Planner renders inside a shadow root when the ecosystem shell hosts it (src/embed.tsx), so document-level listeners see the
// shadow host as the event target and document.activeElement is the host. These helpers read the real element instead.

/** The element the event really happened on (inside the shadow root, if any). */
export const realTarget = (e: Event): EventTarget | null => (typeof e.composedPath === 'function' ? e.composedPath()[0] ?? e.target : e.target);

/** True when the event happened inside `el`. */
export const eventInside = (el: Element | null | undefined, e: Event): boolean => !!el && (typeof e.composedPath === 'function' ? e.composedPath().includes(el) : el.contains(e.target as Node));

/** The focused element in the same document or shadow root as `node`. */
export const activeIn = (node: Node | null | undefined): Element | null => {
  const root = node?.getRootNode() as Document | ShadowRoot | undefined;
  return root && 'activeElement' in root ? root.activeElement : document.activeElement;
};

/** getElementById within the same document or shadow root as `node`. */
export const byId = (node: Node | null | undefined, id: string): HTMLElement | null => {
  const root = node?.getRootNode() as Document | ShadowRoot | undefined;
  return root && 'getElementById' in root ? root.getElementById(id) : document.getElementById(id);
};

/** True while the person is typing in a field (so single-key shortcuts like "/" must not fire). */
export const isTyping = (e: Event): boolean => /input|textarea|select/i.test((realTarget(e) as HTMLElement | null)?.tagName ?? '') || !!(realTarget(e) as HTMLElement | null)?.isContentEditable;
