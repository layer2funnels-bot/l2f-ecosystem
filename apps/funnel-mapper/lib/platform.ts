// Platform-aware keyboard hints: ⌘ / ⌥ / ⇧ on Apple devices, Ctrl / Alt / Shift elsewhere. Browser only (menus render after hydration).
export const isApple = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** "Mod+Alt+C" style spec → "⌥⌘C" (Apple) or "Ctrl+Alt+C". Tokens: Mod, Alt, Shift, then a key. */
export function kbd(spec: string): string {
  const parts = spec.split("+");
  const key = parts[parts.length - 1];
  const has = (m: string) => parts.includes(m);
  if (isApple()) return `${has("Alt") ? "⌥" : ""}${has("Shift") ? "⇧" : ""}${has("Mod") ? "⌘" : ""}${key === "Backspace" ? "⌫" : key}`;
  return [has("Mod") && "Ctrl", has("Alt") && "Alt", has("Shift") && "Shift", key === "Backspace" ? "Del" : key].filter(Boolean).join("+");
}
