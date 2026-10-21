"use client";
import { useEffect, useSyncExternalStore } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Icon } from "./icon";

export type Theme = "dark" | "light";
const YEAR = 60 * 60 * 24 * 365;

/** Reads the theme applied to the page (dark-first: anything but an explicit "light" is Dark). */
export const currentTheme = (): Theme => (typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** Applies a theme instantly (no reload) and remembers it on this device: local storage plus a cookie the server reads before first paint. */
function applyLocal(t: Theme, at = Date.now()) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("fm-theme", t);
    localStorage.setItem("fm-theme-at", String(at));
  } catch {}
  document.cookie = `fm-theme=${t}; path=/; max-age=${YEAR}; samesite=lax`;
  window.dispatchEvent(new Event("fm-theme"));
}

/** Sets the theme and stores it on the person (Supabase user metadata), so it follows them to every device. */
export function setTheme(t: Theme) {
  const at = Date.now();
  applyLocal(t, at);
  // Best effort: share pages and signed-out screens have no user; the device choice above still applies.
  const sb = supabaseBrowser();
  sb.auth
    .getUser()
    .then(({ data }) => (data.user && data.user.user_metadata?.theme !== t ? sb.auth.updateUser({ data: { theme: t, theme_at: at } }) : null))
    .catch(() => {});
}

export function toggleTheme() {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

/**
 * Keeps this device in step with the theme saved on the person (signed-in pages only). The newer choice wins, so a
 * change made on another device arrives here, and a choice made on this device before it was saved is not undone.
 */
export function ThemeSync({ saved, at }: { saved: Theme | null; at: number }) {
  useEffect(() => {
    if (!saved || saved === currentTheme()) return;
    let localAt = 0;
    try {
      const t = localStorage.getItem("fm-theme");
      localAt = Number(localStorage.getItem("fm-theme-at")) || (t ? Date.now() : 0);
    } catch {}
    if (at > localAt) applyLocal(saved, at);
  }, [saved, at]);
  return null;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("fm-theme", cb);
  return () => window.removeEventListener("fm-theme", cb);
};
export const useTheme = () => useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);

export function ThemeToggle({ className = "btn ghost w-full justify-start" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={toggleTheme}>
      <Icon name="moon" /> Light / dark
    </button>
  );
}

/** Settings → Appearance: Dark (default) and Light side by side, each with a small preview. There is no third option. */
export function AppearancePicker() {
  const theme = useTheme();
  const opts: { id: Theme; label: string; help: string; c: { bg: string; panel: string; line: string; ink: string; muted: string } }[] = [
    { id: "dark", label: "Dark", help: "The standard Funnel Mapper look.", c: { bg: "#0B1220", panel: "#111827", line: "#334155", ink: "#E2E8F0", muted: "#94A3B8" } },
    { id: "light", label: "Light", help: "The same layout on a light surface.", c: { bg: "#F4F6FA", panel: "#FFFFFF", line: "#C4CEDB", ink: "#0F172A", muted: "#55657B" } },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-2">
      {opts.map((o) => {
        const on = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setTheme(o.id)}
            className={`relative rounded-xl border p-3 text-left ${on ? "border-brand ring-2 ring-brand/40" : "border-line hover:border-brand"}`}
            data-testid={`theme-${o.id}`}
          >
            <svg viewBox="0 0 260 112" className="mb-2 block w-full rounded-lg" aria-hidden="true">
              <rect width="260" height="112" rx="8" fill={o.c.bg} stroke={o.c.line} />
              <rect x="12" y="22" width="52" height="68" rx="6" fill={o.c.panel} stroke={o.c.line} />
              {[40, 72].map((y) => (
                <g key={y}>
                  <circle cx="26" cy={y} r="6" fill="#60A5FA" />
                  <rect x="37" y={y - 4} width="20" height="3" rx="1.5" fill={o.c.ink} />
                  <rect x="37" y={y + 1} width="13" height="2.5" rx="1.25" fill={o.c.muted} />
                </g>
              ))}
              <path d="M64 56 C74 56 70 56 84 56" stroke={o.c.muted} strokeWidth="1.5" fill="none" />
              {[84, 134].map((x, i) => (
                <g key={x}>
                  <rect x={x} y="38" width="36" height="36" rx="4" fill={o.c.panel} stroke={o.c.line} />
                  <rect x={x} y="38" width="36" height="5" rx="2" fill={i === 0 ? "#A78BFA" : "#FB923C"} />
                  <rect x={x + 6} y="50" width="20" height="3" rx="1.5" fill={o.c.ink} />
                  <rect x={x + 6} y="57" width="14" height="2.5" rx="1.25" fill={o.c.muted} />
                  <rect x={x + 6} y="64" width="24" height="4" rx="2" fill={i === 0 ? "#A78BFA" : "#FB923C"} opacity="0.85" />
                </g>
              ))}
              <path d="M120 56 H134" stroke="#10B981" strokeWidth="1.5" />
              <path d="M170 56 H184" stroke="#10B981" strokeWidth="1.5" />
              <rect x="184" y="49" width="14" height="14" rx="3" fill="#FBBF24" />
              <path d="M198 56 H212" stroke="#10B981" strokeWidth="1.5" />
              <rect x="212" y="30" width="36" height="22" rx="4" fill={o.c.panel} stroke={o.c.line} />
              <rect x="212" y="30" width="36" height="4" rx="2" fill="#FB923C" />
              <rect x="218" y="40" width="18" height="3" rx="1.5" fill={o.c.ink} />
              <path d="M191 63 V86 H206" stroke="#FB923C" strokeWidth="1.5" strokeDasharray="3 2.5" fill="none" />
              <circle cx="213" cy="86" r="6" fill="#2DD4BF" />
              <path d="M219 86 H226" stroke="#10B981" strokeWidth="1.5" />
              <rect x="226" y="76" width="22" height="20" rx="4" fill={o.c.panel} stroke={o.c.line} />
              <rect x="226" y="76" width="22" height="4" rx="2" fill="#FB923C" />
            </svg>
            <span aria-hidden="true" className={`absolute right-5 top-5 grid h-5 w-5 place-items-center rounded-full border text-[11px] font-bold ${on ? "border-brand bg-brand text-[#06281d]" : "border-line bg-bg/70"}`}>
              {on ? "✓" : ""}
            </span>
            <span className="flex items-center gap-2 font-bold">
              {o.label}
              {o.id === "dark" && <span className="rounded-full border border-line px-2 text-[11px] font-medium text-muted">Default</span>}
            </span>
            <span className="text-sm text-muted">{o.help}</span>
          </button>
        );
      })}
    </div>
  );
}
