"use client";
import { useActionState, useEffect, useId, useRef } from "react";
import { createWorkspaceAction, switchWorkspaceAction } from "@/app/(app)/actions";
import type { WorkspaceOption } from "@/lib/supabase/server";
import { Icon } from "./icon";

/**
 * Sidebar workspace button (V2 D1). Opens a popover menu over the page: your workspaces, and (admins) creating a new one.
 * Collapses to the workspace tile on the 64px icon rail.
 */
export function WorkspaceSwitcher({ currentId, workspaces, canCreate, logo, team }: { currentId: string; workspaces: WorkspaceOption[]; canCreate: boolean; logo?: string | null; team: boolean }) {
  const [state, create] = useActionState(createWorkspaceAction, undefined);
  const id = useId();
  const ref = useRef<HTMLDetailsElement>(null);
  const current = workspaces.find((w) => w.id === currentId);
  const kind = (w: WorkspaceOption) => (w.kind === "team" ? "Layer2Funnels team" : "Workspace");
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
  const name = current?.name ?? "Workspace";
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
          <span className="block truncate text-[13.5px] font-semibold text-side-ink">{name}</span>
          <span className="block text-[11.5px] text-side-muted" data-testid="workspace-kind">
            {team ? "Team workspace" : "Private workspace"}
          </span>
        </span>
        <Icon name="chevronRight" size={16} className="shrink-0 text-side-muted transition-transform group-open:rotate-90 lg:max-xl:hidden" />
      </summary>
      <div className="absolute top-full left-0 z-50 mt-1 w-[264px] rounded-[10px] bg-side-item p-2 shadow-card ring-1 ring-white/10">
        <ul className="m-0 list-none p-0" aria-label="Your workspaces">
          {workspaces.map((w) => (
            <li key={w.id}>
              <form action={switchWorkspaceAction.bind(null, w.id)}>
                <button
                  className={`flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${w.id === currentId ? "bg-white/10 text-side-ink" : "text-side-muted hover:bg-white/5 hover:text-side-ink"}`}
                  aria-current={w.id === currentId ? "true" : undefined}
                  disabled={w.id === currentId}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  <span className="shrink-0 text-[11px] text-side-muted">{kind(w)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        {canCreate && (
          <form action={create} className="mt-2 border-t border-white/10 pt-2">
            <label htmlFor={`${id}-ws`} className="mb-1 block px-1 text-xs font-semibold text-side-muted">
              New workspace
            </label>
            <input id={`${id}-ws`} name="name" className="input mb-2 w-full" placeholder="Workspace name" maxLength={120} required autoComplete="off" />
            {state?.error && (
              <p role="alert" className="mb-2 px-1 text-xs text-bad">
                {state.error}
              </p>
            )}
            <button className="btn primary sm w-full">
              <Icon name="plus" /> Create workspace
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
