"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Icon } from "./icon";
import { NewClientButton } from "./new-client-sheet";
import { NewFunnelButton, type TemplateOption } from "./new-funnel-dialog";

/**
 * Top strip of the app shell (V2 D1): search (⌘K) and the two global create actions. Search reuses the Clients list
 * search (`/clients?q=`), the only search the app has. Hidden actions: viewers can't create; a client's own page has
 * its own "New funnel" with that client preselected.
 */
export function TopStrip({ canEdit, clients, templates, defaultCurrency = "GBP", niches = [] }: { canEdit: boolean; clients: { id: string; name: string }[]; templates: TemplateOption[]; defaultCurrency?: string; niches?: string[] }) {
  const path = usePathname();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const onClientPage = /^\/clients\/[^/]+$/.test(path) && path !== "/clients/new";
  return (
    <div className="sticky top-12 z-30 flex h-[56px] max-sm:top-0 items-center gap-3 border-b border-side-line bg-bg px-4 sm:px-6 lg:top-0 lg:px-10">
      <form action="/clients" role="search" className="fm-search flex h-[34px] min-w-0 flex-1 items-center gap-2.5 rounded-[9px] border border-line bg-library px-2.5 text-muted focus-within:border-brand sm:max-w-[380px] sm:flex-none sm:basis-[380px]">
        <Icon name="search" size={16} />
        <input ref={input} name="q" type="search" aria-label="Quick search" placeholder="Search clients, funnels, templates…" autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
        <kbd className="hidden rounded border border-line px-1 font-mono text-[10.5px] leading-[15px] text-muted sm:inline">⌘K</kbd>
      </form>
      <span className="flex-1 max-sm:hidden" />
      {canEdit && (
        <>
          <span className="max-sm:hidden">
            <NewClientButton defaultCurrency={defaultCurrency} niches={niches} />
          </span>
          <Link href="/clients/new" aria-label="New client" className="btn sm w-11 px-0 sm:hidden">
            <Icon name="plus" size={15} />
          </Link>
          {!onClientPage && <NewFunnelButton clients={clients} templates={templates} className="btn primary sm" />}
        </>
      )}
    </div>
  );
}
