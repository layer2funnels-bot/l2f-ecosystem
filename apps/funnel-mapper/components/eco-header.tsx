"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "./icon";
import { NewClientButton } from "./new-client-sheet";
import { NewFunnelButton, type TemplateOption } from "./new-funnel-dialog";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { WorkspaceOption } from "@/lib/supabase/server";
import type { UiIconName } from "@/lib/icons";

/**
 * The ecosystem header for Funnel Mapper Pro (design 08, step 1: the look only). A colour bar, then: Launcher button, the
 * organization, search, the global create actions, and the profile menu; under it the Funnel Mapper Pro menu. In the editor it is
 * compact (a thin bar) to protect the canvas height. Funnel Mapper Pro still has its own sign-in and its own workspaces in this step,
 * so the organization label is the workspace you are in and cannot be switched here: switching organizations arrives when this app
 * moves onto the ecosystem sign-in and database (docs/FMP_MIGRATION_PLAN.md). Search and Launcher only do what they can do today.
 */
const MENU: { href: string; label: string; icon: UiIconName }[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/clients", label: "Clients", icon: "users" },
  { href: "/funnels", label: "Funnels", icon: "logo" },
  { href: "/templates", label: "Templates", icon: "layers" },
];
const initials = (s: string) => s.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

type Props = {
  org: string;
  workspaceId: string;
  workspaces: WorkspaceOption[];
  canCreateWorkspace: boolean;
  team: boolean;
  logo?: string | null;
  user: string;
  email: string;
  role: string;
  launcherUrl: string;
  trash?: number;
  compact?: boolean;
  canEdit?: boolean;
  clients?: { id: string; name: string }[];
  templates?: TemplateOption[];
  defaultCurrency?: string;
  niches?: string[];
};

export function EcoHeader({ org, workspaceId, workspaces, canCreateWorkspace, team, logo, user, email, role, launcherUrl, trash = 0, compact = false, canEdit = false, clients = [], templates = [], defaultCurrency = "GBP", niches = [] }: Props) {
  const path = usePathname();
  const search = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && search.current) {
        e.preventDefault();
        search.current.focus();
        search.current.select();
      }
    };
    const out = (e: PointerEvent) => {
      const d = menu.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      const d = menu.current;
      if (e.key === "Escape" && d?.open) {
        d.open = false;
        d.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", out);
    document.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", out);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const onClientPage = /^\/clients\/[^/]+$/.test(path) && path !== "/clients/new";
  const launcher = launcherUrl ? (
    <a href={launcherUrl} aria-label="Open the app Launcher" className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-ink hover:bg-panel2">
      <Icon name="grid" size={20} />
    </a>
  ) : (
    <span role="img" aria-label="The app Launcher link is set when Funnel Mapper Pro goes live" title="The app Launcher link is set when Funnel Mapper Pro goes live" className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-muted opacity-60">
      <Icon name="grid" size={20} />
    </span>
  );
  const orgLabel = (
    <span className="flex min-h-10 min-w-0 items-center gap-2.5 rounded-[10px] border border-edge bg-panel px-1.5 pr-3" title={team ? "Team workspace" : "Private workspace"}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain" />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-[13px] font-bold text-brand-ink" aria-hidden="true">
          {initials(org)}
        </span>
      )}
      <span className="min-w-0 leading-tight max-sm:hidden">
        <span className="block text-[11px] text-muted">{compact ? "Funnel Mapper Pro" : "Organization"}</span>
        <span className="block truncate text-[14.5px] font-semibold text-ink">{org}</span>
      </span>
    </span>
  );
  const profile = (
    <details ref={menu} className="relative shrink-0">
      <summary aria-label={`Your profile: ${user}`} className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-panel2 text-[13px] font-bold text-brand">{initials(user)}</span>
      </summary>
      <div className="absolute top-full right-0 z-50 mt-1 w-[260px] rounded-xl border border-line bg-panel p-2 shadow-card">
        <div className="px-2.5 py-2">
          <div className="truncate text-sm font-semibold text-ink">{user}</div>
          <div className="truncate text-xs text-muted">{email}</div>
          <div className="text-xs text-muted">{role}</div>
        </div>
        <div className="my-1 border-t border-line" />
        <Link href="/settings" className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink no-underline hover:bg-panel2" onClick={() => menu.current?.removeAttribute("open")}>
          <Icon name="settings" size={16} /> Settings
        </Link>
        <Link href="/trash" className="flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink no-underline hover:bg-panel2" onClick={() => menu.current?.removeAttribute("open")}>
          <Icon name="trash" size={16} /> Trash
          {trash > 0 && (
            <span className="ml-auto text-xs text-muted tabular-nums" aria-label={`${trash} in Trash`}>
              {trash}
            </span>
          )}
        </Link>
        <form action="/auth/signout" method="post">
          <button className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-ink hover:bg-panel2">
            <Icon name="logout" size={16} /> Sign out
          </button>
        </form>
      </div>
    </details>
  );

  if (compact)
    return (
      <header className="eco-compact sticky top-0 z-40 border-b border-line bg-panel" data-testid="eco-header">
        <div className="h-1 bg-brand" />
        <div className="flex h-10 items-center gap-2 px-2">
          {launcher}
          {orgLabel}
          <Link href="/funnels" className="btn ghost sm max-sm:hidden">
            <Icon name="chevronLeft" size={14} /> All funnels
          </Link>
          <span className="flex-1" />
          {profile}
        </div>
      </header>
    );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel" data-testid="eco-header">
      <div className="h-1 bg-brand" />
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4">
        {launcher}
        <WorkspaceSwitcher currentId={workspaceId} workspaces={workspaces} canCreate={canCreateWorkspace} logo={logo} team={team} />
        <form action="/clients" role="search" className="fm-search order-last flex h-11 min-w-0 basis-full items-center gap-2.5 rounded-[10px] border border-edge bg-panel px-3 text-muted focus-within:border-brand sm:order-none sm:basis-0 sm:flex-1">
          <Icon name="search" size={16} />
          <input ref={search} name="q" type="search" aria-label="Quick search" placeholder="Search clients, funnels, templates…" autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted" />
          <kbd className="hidden rounded border border-line px-1 font-mono text-[10.5px] leading-[15px] text-muted sm:inline">⌘K</kbd>
        </form>
        {canEdit && (
          <>
            <span className="max-sm:hidden">
              <NewClientButton defaultCurrency={defaultCurrency} niches={niches} />
            </span>
            {!onClientPage && <NewFunnelButton clients={clients} templates={templates} className="btn primary sm max-sm:hidden" />}
          </>
        )}
        <span className="max-sm:flex-1 sm:hidden" />
        {profile}
      </div>
      <nav aria-label="Funnel Mapper Pro" className="flex gap-0.5 overflow-x-auto border-t border-line bg-panel px-2 max-sm:hidden">
        <span className="flex min-h-11 items-center border-r border-line pr-3 pl-2 text-sm font-bold whitespace-nowrap text-ink">Funnel Mapper Pro</span>
        {MENU.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={`flex min-h-11 items-center border-b-[3px] px-3 text-sm font-medium whitespace-nowrap no-underline ${active(n.href) ? "border-brand font-bold text-brand" : "border-transparent text-muted hover:bg-panel2 hover:text-ink"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="Funnel Mapper Pro sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] sm:hidden">
        {MENU.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold no-underline ${active(n.href) ? "text-brand" : "text-muted"}`}>
            <span className={`grid h-7 w-11 place-items-center rounded-full ${active(n.href) ? "bg-panel2" : ""}`}>
              <Icon name={n.icon} size={20} />
            </span>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
