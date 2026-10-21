"use client";
import { useActionState, useEffect, useId, useRef } from "react";
import { createWorkspaceAction, switchWorkspaceAction } from "@/app/(app)/actions";
import type { WorkspaceOption } from "@/lib/supabase/server";
import { Icon } from "./icon";

/**
 * Workspace control in the ecosystem header (design 08, step 1: the look only). Opens a popover menu over the page: your workspaces,
 * and (admins) creating a new one. Funnel Mapper Pro keeps its own workspaces in this step; the ecosystem organization switcher
 * replaces this when the app moves onto the ecosystem sign-in and database.
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
    <details ref={ref} className="group relative min-w-0" data-testid="workspace-switcher">
      <summary title={name} className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-[10px] border border-edge bg-panel px-1.5 pr-2.5 hover:bg-panel2 [&::-webkit-details-marker]:hidden">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-bold text-brand-ink" aria-hidden="true">
            {name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"}
          </span>
        )}
        <span className="min-w-0 leading-tight max-sm:hidden">
          <span className="block text-[11px] text-muted" data-testid="workspace-kind">
            {team ? "Team workspace" : "Private workspace"}
          </span>
          <span className="block truncate text-[14.5px] font-semibold text-ink">{name}</span>
        </span>
        <Icon name="chevronRight" size={16} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
      </summary>
      <div className="absolute top-full left-0 z-50 mt-1 w-[264px] max-w-[calc(100vw-24px)] rounded-xl border border-line bg-panel p-2 shadow-card">
        <ul className="m-0 list-none p-0" aria-label="Your workspaces">
          {workspaces.map((w) => (
            <li key={w.id}>
              <form action={switchWorkspaceAction.bind(null, w.id)}>
                <button
                  className={`flex min-h-[38px] w-full items-center gap-2 rounded-lg px-2 text-left text-sm ${w.id === currentId ? "bg-panel2 text-ink" : "text-muted hover:bg-panel2 hover:text-ink"}`}
                  aria-current={w.id === currentId ? "true" : undefined}
                  disabled={w.id === currentId}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{w.name}</span>
                  <span className="shrink-0 text-[11px] text-muted">{kind(w)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
        {canCreate && (
          <form action={create} className="mt-2 border-t border-line pt-2">
            <label htmlFor={`${id}-ws`} className="mb-1 block px-1 text-xs font-semibold text-muted">
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
