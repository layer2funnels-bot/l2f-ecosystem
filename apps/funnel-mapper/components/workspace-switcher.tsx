"use client";
import { useEffect, useRef } from "react";
import { switchWorkspaceAction } from "@/app/(app)/actions";
import type { WorkspaceOption } from "@/lib/supabase/server";
import { Icon } from "./icon";

/**
 * Sidebar organization button (V7 16 §2): the ecosystem organization you work in, the others you can switch to, and "All apps"
 * (the way back to the ecosystem Launcher). Organizations are created and managed in Office › Admin, not here.
 * Collapses to the organization tile on the 64px icon rail.
 */
export function WorkspaceSwitcher({ currentId, workspaces, logo, appsUrl }: { currentId: string; workspaces: WorkspaceOption[]; logo?: string | null; appsUrl?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const current = workspaces.find((w) => w.id === currentId);
  // close on outside click and Escape (the popover floats over the page)
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
    <details ref={ref} className="group relative mb-3" data-testid="workspace-switcher">
      <summary title={name} className="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-[9px] px-2 hover:bg-side-item lg:max-xl:justify-center [&::-webkit-details-marker]:hidden">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-7 w-7 shrink-0 rounded-md bg-white object-contain" />
        ) : (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-slate-50 text-[#15803d]" aria-hidden="true">
            <Icon name="logo" size={16} strokeWidth={2.2} />
          </span>
        )}
        <span className="min-w-0 flex-1 lg:max-xl:sr-only">
          <span className="block truncate text-[14.5px] font-semibold text-side-ink">{name}</span>
          <span className="block text-[12.5px] text-side-muted" data-testid="workspace-kind">
            Funnel Mapper
          </span>
        </span>
        <Icon name="chevronRight" size={16} className="shrink-0 text-side-muted transition-transform group-open:rotate-90 lg:max-xl:hidden" />
      </summary>
      <div className="absolute top-full left-0 z-50 mt-1 w-[264px] rounded-[10px] bg-side-item p-2 shadow-card ring-1 ring-white/10">
        <ul className="m-0 list-none p-0" aria-label="Your organizations">
          {workspaces.map((w) => (
            <li key={w.id}>
              <form action={switchWorkspaceAction.bind(null, w.id)}>
                <button
                  className={`flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${w.id === currentId ? "bg-white/10 text-side-ink" : "text-side-muted hover:bg-white/5 hover:text-side-ink"}`}
                  aria-current={w.id === currentId ? "true" : undefined}
                  disabled={w.id === currentId}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  <span className="shrink-0 text-[12px] text-side-muted">{w.id === currentId ? "Current" : "Switch"}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        {appsUrl && (
          <a href={appsUrl} className="mt-2 flex min-h-[38px] items-center gap-2 rounded-lg border-t border-white/10 px-2 pt-2 text-sm text-side-muted no-underline hover:text-side-ink">
            <Icon name="grid" size={16} /> All apps
          </a>
        )}
      </div>
    </details>
  );
}
