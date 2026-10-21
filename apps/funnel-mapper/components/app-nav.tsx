"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark, Icon } from "./icon";
import { toggleTheme } from "./theme-toggle";
import type { UiIconName } from "@/lib/icons";
import type { WorkspaceOption } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "./workspace-switcher";

const NAV: { href: string; label: string; icon: UiIconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/clients", label: "Clients", icon: "users" },
  { href: "/funnels", label: "Funnels", icon: "logo" },
  { href: "/templates", label: "Templates", icon: "layers" },
];
const SETTINGS = { href: "/settings", label: "Settings", icon: "settings" as UiIconName };
const TRASH = { href: "/trash", label: "Trash", icon: "trash" as UiIconName };

const initials = (s: string) =>
  s
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/**
 * App shell navigation (V2 D1). ≥1280: 232px sidebar. 1024–1279: 64px icon rail (labels in tooltips). 640–1023: left drawer
 * from a menu button. Phone: bottom tab bar (More opens the drawer).
 */
export function AppNav({ agency, user, role, logo, team, workspaceId, workspaces, canCreate, trash = 0, pinned = [], counts = {} }: { agency: string; user: string; role: string; logo?: string | null; team: boolean; workspaceId: string; workspaces: WorkspaceOption[]; canCreate: boolean; trash?: number; pinned?: { id: string; name: string; status: string }[]; counts?: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const link = (n: { href: string; label: string; icon: UiIconName }) => (
    <Link
      key={n.href}
      href={n.href}
      title={n.label}
      onClick={() => setOpen(false)}
      aria-current={active(n.href) ? "page" : undefined}
      className={`flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium no-underline lg:max-xl:justify-center lg:max-xl:px-0 ${active(n.href) ? "bg-side-item text-side-ink shadow-[inset_2px_0_0_var(--brand)]" : "text-side-muted hover:bg-side-item hover:text-side-ink"}`}
    >
      <Icon name={n.icon} size={17} />
      <span className="lg:max-xl:sr-only">{n.label}</span>
      {n.href === "/trash" && trash > 0 && (
        <span className="ml-auto text-[11.5px] text-side-muted tabular-nums lg:max-xl:sr-only" aria-label={`${trash} in Trash`}>
          {trash}
        </span>
      )}
      {counts[n.href] ? (
        <span className="ml-auto text-[11.5px] text-side-muted tabular-nums lg:max-xl:sr-only">{counts[n.href]}</span>
      ) : null}
    </Link>
  );
  const quiet = "h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-side-muted hover:bg-side-item hover:text-side-ink lg:max-xl:justify-center lg:max-xl:px-0";
  const nav = (
    <nav aria-label="Main" className="flex h-full flex-col gap-0.5 px-3 py-3.5 lg:max-xl:px-2">
      <WorkspaceSwitcher currentId={workspaceId} workspaces={workspaces} canCreate={canCreate} logo={logo} team={team} />
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.map(link)}
        {link(TRASH)}
        {pinned.length > 0 && (
          <>
            <div className="px-2.5 pt-4 pb-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-side-muted uppercase lg:max-xl:hidden">Pinned clients</div>
            {pinned.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} title={c.name} onClick={() => setOpen(false)} className="flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-side-muted no-underline hover:bg-side-item hover:text-side-ink lg:max-xl:justify-center lg:max-xl:px-0">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c.status === "active" ? "#22c55e" : c.status === "proposal" ? "#60a5fa" : "#94a3b8" }} aria-hidden="true" />
                <span className="truncate lg:max-xl:sr-only">{c.name}</span>
              </Link>
            ))}
          </>
        )}
      </div>
      <div className="mt-2 flex flex-col gap-0.5 pt-2">
        {link(SETTINGS)}
        <div className="flex items-center gap-2.5 px-1.5 pt-2 lg:max-xl:justify-center" title={`${user} · ${agency}`}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#334155] bg-side-item text-[11px] font-bold text-side-ink">{initials(user)}</span>
          <span className="min-w-0 flex-1 lg:max-xl:sr-only">
            <span className="block truncate text-[13px] font-semibold text-side-ink">{user}</span>
            <span className="block text-[11.5px] text-side-muted">{role}</span>
          </span>
          <button type="button" onClick={toggleTheme} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-side-muted hover:bg-side-item hover:text-side-ink lg:max-xl:hidden" aria-label="Switch light / dark theme" title="Light / dark">
            <Icon name="moon" size={16} />
          </button>
        </div>
        <button type="button" onClick={toggleTheme} className={`${quiet} hidden lg:max-xl:flex`} title="Light / dark">
          <Icon name="moon" size={16} />
          <span className="sr-only">Light / dark</span>
        </button>
        <form action="/auth/signout" method="post">
          <button className={`${quiet} flex`} title="Sign out">
            <Icon name="logout" size={16} />
            <span className="lg:max-xl:sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </nav>
  );
  const tab = (n: { href: string; label: string; icon: UiIconName }) => (
    <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium no-underline ${active(n.href) ? "text-brand-light" : "text-muted"}`}>
      <Icon name={n.icon} size={20} />
      {n.label}
    </Link>
  );
  return (
    <>
      <aside className="sticky top-0 hidden h-screen shrink-0 border-r border-side-line bg-side lg:block lg:w-16 xl:w-[232px]">{nav}</aside>
      <div className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-line bg-panel px-3 max-sm:hidden lg:hidden">
        <button className="btn icon max-sm:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="menu" />
        </button>
        <Link href="/" className="fm-brandlink flex items-center gap-2 font-display text-[17px] font-extrabold text-ink no-underline">
          <BrandMark size={26} /> Funnel Mapper Pro V2
        </Link>
      </div>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] sm:hidden">
        {NAV.map(tab)}
        <button type="button" className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted" aria-expanded={open} onClick={() => setOpen(true)}>
          <Icon name="menu" size={20} />
          More
        </button>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[270px] bg-side">{nav}</aside>
        </div>
      )}
    </>
  );
}
