"use client";
// New client side sheet (V2 "Clients" / "New-client"): the four required fields first, everything else under "Add details".
// Opens from the top strip and the Clients page; /clients/new still works as a plain page for links and phones.
import { useEffect, useId, useRef, useState } from "react";
import { createClientAction } from "@/app/(app)/actions";
import { ClientForm } from "./client-form";
import { Icon } from "./icon";

export function NewClientButton({ defaultCurrency, niches, className = "btn sm", children }: { defaultCurrency: string; niches: string[]; className?: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false); // the form is mounted only while the sheet is open (no second copy of every field on the page)
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // clicking the dimmed area closes the sheet
    const click = (e: MouseEvent) => e.target === d && d.close();
    d.addEventListener("click", click);
    return () => d.removeEventListener("click", click);
  }, []);
  return (
    <>
      <button type="button" className={className} onClick={() => (setOpen(true), ref.current?.showModal())} aria-haspopup="dialog">
        {children ?? (
          <>
            <Icon name="plus" size={15} /> New client
          </>
        )}
      </button>
      <dialog ref={ref} className="fm-sheetdlg" aria-labelledby={id} onClose={() => setOpen(false)}>
        <header>
          <h2 id={id}>New client</h2>
          <button type="button" className="btn icon ghost" aria-label="Close" onClick={() => ref.current?.close()}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="body">
          {open && <ClientForm action={createClientAction} defaultCurrency={defaultCurrency} submitLabel="Create client" niches={niches} onCancel={() => ref.current?.close()} />}
        </div>
      </dialog>
    </>
  );
}
