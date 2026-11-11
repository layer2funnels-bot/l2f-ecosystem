// Projects renders inside a shadow root (embed.tsx). document.getElementById / querySelector cannot see into it, portals
// to document.body would land outside it (unstyled), and document.activeElement reports only the host element. Every
// such lookup goes through these helpers instead.
let rootNode: ShadowRoot | Document = document;
let portalNode: HTMLElement | null = null;

export function setDomRoot(root: ShadowRoot | null, portal: HTMLElement | null): void {
  rootNode = root ?? document; portalNode = portal;
}
/** The node to search for Projects' own elements. */
export const domRoot = (): ShadowRoot | Document => rootNode;
/** Where dialogs, menus and toasts are portalled: inside the shadow root, so the Projects styles reach them. */
export const portalTarget = (): HTMLElement => portalNode ?? document.body;
/** The focused element inside Projects (sees through the shadow boundary). */
export function activeEl(): Element | null {
  let a: Element | null = document.activeElement;
  while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
  return a;
}
export const byId = (id: string): HTMLElement | null => rootNode.getElementById(id) as HTMLElement | null;
