"use client";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { switchWorkspaceAction } from "@/app/(app)/actions";
import type { WorkspaceOption } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/roles";
import { Icon } from "./icon";

const NOTE_KEY = "fm-switch-note";

/** The organization's mark, drawn as the ecosystem draws it (apps/web/js/ui.js orgMarkEl, v4.css .m-l2f / .m-aurj). */
export function OrgMark({ org, size = 28 }: { org?: { name: string; slug?: string } | null; size?: number }) {
  const box = { width: size, height: size, borderRadius: size * 0.3 } as const;
  if (org?.slug === "aurj")
    return (
      <span aria-hidden="true" className="grid shrink-0 place-items-center overflow-hidden" style={{ ...box, background: "linear-gradient(160deg,#C2416B,#7E1C3D)", color: "#FFF4EE" }}>
        <b style={{ fontSize: size * 0.3, fontWeight: 600, marginTop: "-8%" }}>عروج</b>
      </span>
    );
  if (org?.slug === "layer2funnels" || org?.slug === "l2f")
    return (
      <span aria-hidden="true" className="relative grid shrink-0 place-items-center overflow-hidden" style={{ ...box, background: "#1B1D23", color: "#FFC633", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)" }}>
        <b className="font-display" style={{ fontSize: size * 0.42, fontWeight: 800, lineHeight: 1, letterSpacing: "-.05em" }}>L2</b>
        <i style={{ position: "absolute", left: "24%", right: "24%", bottom: "17%", height: Math.max(2, size * 0.07), background: "#4F7DFF", borderRadius: 2 }} />
      </span>
    );
  const initials = (org?.name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center bg-slate-200 font-bold text-slate-800" style={{ ...box, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

/** Switches organization with the ecosystem's rule, then reloads the page so nothing of the old organization stays on screen. */
export function useOrgSwitch() {
  const path = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const go = async (orgId: string) => {
    setPending(orgId);
    setError("");
    const r = await switchWorkspaceAction(orgId, path).catch(() => ({ to: path, error: "Couldn’t switch. The connection dropped before your access was confirmed. Nothing was changed." }));
    if (r.error) {
      setPending(null);
      return setError(r.error);
    }
    try {
      if ("message" in r && r.message) sessionStorage.setItem(NOTE_KEY, r.message);
    } catch {
      /* private window: the switch still happens */
    }
    window.location.assign(r.to);
  };
  return { go, pending, error };
}

/**
 * Sidebar organization switcher, the same as every ecosystem app (apps/web/js/views/shell.js `switcher`): your organizations with your
 * role in each, the current one checked. The ecosystem remembers the choice for all apps. Collapses to the mark on the icon rail.
 * Below it, "All apps" goes back to the Launcher.
 */
export function WorkspaceSwitcher({ currentId, workspaces, appsUrl }: { currentId: string; workspaces: WorkspaceOption[]; appsUrl?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const menuId = useId();
  const current = workspaces.find((w) => w.id === currentId);
  const { go, pending, error } = useOrgSwitch();
  const [note, setNote] = useState("");
  useEffect(() => {
    try {
      const n = sessionStorage.getItem(NOTE_KEY);
      if (n) {
        sessionStorage.removeItem(NOTE_KEY);
        setNote(n);
        const t = setTimeout(() => setNote(""), 7000);
        return () => clearTimeout(t);
      }
    } catch {
      /* nothing to show */
    }
  }, []);
  // close on outside click and Escape (the menu floats over the page)
  useEffect(() => {
    const out = (e: PointerEvent) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      const d = ref.current;
      if (e.key === "Escape" && d?.open) {
        d.open = false;
        d.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", out);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const name = current?.name ?? "Organization";
  return (
    <div className="mb-3">
      <details ref={ref} className="group relative" data-testid="workspace-switcher">
        <summary
          id="org-switcher"
          title={`${name} · switch organization`}
          aria-busy={pending ? true : undefined}
          className="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-[9px] px-2 hover:bg-side-item lg:max-xl:justify-center [&::-webkit-details-marker]:hidden"
        >
          <OrgMark org={current} size={28} />
          <span className="min-w-0 flex-1 lg:max-xl:sr-only">
            <span className="block truncate text-[14.5px] font-semibold text-side-ink">{name}</span>
            <span className="block text-[12.5px] text-side-muted" data-testid="workspace-kind">
              Funnel Mapper
            </span>
          </span>
          <Icon name="chevronRight" size={16} className="shrink-0 text-side-muted transition-transform group-open:rotate-90 lg:max-xl:hidden" />
        </summary>
        <div id={menuId} role="menu" aria-label="Switch organization" className="absolute top-full left-0 z-50 mt-1 w-[288px] rounded-[10px] bg-side-item p-2 shadow-card ring-1 ring-white/10">
          <p className="mb-1 px-2 pt-1 text-[12px] font-semibold tracking-wide text-side-muted uppercase">Your organizations</p>
          {workspaces.map((w) => {
            const cur = w.id === currentId;
            return (
              <button
                key={w.id}
                type="button"
                role="menuitemradio"
                aria-checked={cur}
                data-org={w.id}
                disabled={!!pending}
                onClick={() => {
                  if (ref.current) ref.current.open = false;
                  if (!cur) void go(w.id);
                }}
                className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-lg px-2 text-left ${cur ? "bg-white/10" : "hover:bg-white/5"}`}
              >
                <OrgMark org={w} size={36} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm font-semibold text-side-ink">{w.name}</strong>
                  <small className="block text-[12px] text-side-muted">{roleLabel(w.role)}</small>
                </span>
                {cur ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-side-muted">
                    <Icon name="check" size={14} /> Current
                  </span>
                ) : pending === w.id ? (
                  <span className="shrink-0 text-[12px] text-side-muted">Switching…</span>
                ) : null}
              </button>
            );
          })}
          <p className="mt-1 border-t border-white/10 px-2 pt-2 text-[12px] leading-snug text-side-muted">Switching keeps you on the same page where it exists. Nothing is copied between organizations.</p>
          {appsUrl && (
            <a href={appsUrl} className="mt-1 flex min-h-[38px] items-center gap-2 rounded-lg px-2 text-sm text-side-muted no-underline hover:bg-white/5 hover:text-side-ink">
              <Icon name="grid" size={16} /> All apps
            </a>
          )}
        </div>
      </details>
      {error && (
        <p role="alert" className="mt-1 px-2 text-[12.5px] leading-snug text-bad">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="mt-1 px-2 text-[12.5px] leading-snug text-side-muted">
          {note}
        </p>
      )}
    </div>
  );
}
