"use client";
import { useState, useTransition } from "react";
import { useConfirm } from "@/components/confirm-dialog";
import { Icon } from "@/components/icon";
import { TimeAgo } from "@/components/time-ago";
import { deleteForeverAction, emptyTrashAction, restoreAction } from "../actions";

export interface TrashItem {
  kind: "client" | "funnel";
  id: string;
  name: string;
  client: string;
  deletedAt: string;
  /** Clients: funnels that went to Trash with them. */
  funnels: number;
}

export function TrashList({ items, canEdit, canDeleteForever }: { items: TrashItem[]; canEdit: boolean; canDeleteForever: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [dialog, ask] = useConfirm();
  const run = (f: () => Promise<{ error?: string } | undefined>, ok: string) =>
    start(async () => {
      const r = await f();
      setMsg(r?.error ? { t: r.error, err: true } : { t: ok });
    });
  if (!items.length)
    return (
      <div className="card px-6 py-14 text-center">
        <Icon name="trash" size={26} className="mx-auto mb-2 text-muted" />
        <p className="font-display text-lg font-bold">Trash is empty</p>
        <p className="text-sm text-muted">Clients and funnels you move to Trash appear here. Nothing in Trash is deleted on a timer.</p>
        {msg && (
          <p className="mt-3 text-sm" role="status">
            {msg.t}
          </p>
        )}
      </div>
    );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="m-0 text-sm text-muted">
          {items.length} {items.length === 1 ? "item" : "items"} in Trash. Share links of items in Trash are switched off.
        </p>
        {canDeleteForever && (
          <button
            type="button"
            className="btn danger ml-auto"
            disabled={pending}
            onClick={async () => {
              const ok = await ask({ title: "Empty Trash?", body: <p>Every client and funnel in Trash is deleted forever, with their versions, actuals and share links. This cannot be undone.</p>, confirm: "Empty Trash", danger: true });
              if (ok) run(emptyTrashAction, "Trash emptied.");
            }}
          >
            <Icon name="trash" /> Empty Trash
          </button>
        )}
      </div>
      {msg && (
        <p className={`mb-3 text-sm ${msg.err ? "text-bad" : ""}`} role={msg.err ? "alert" : "status"}>
          {msg.t}
        </p>
      )}
      <div className="card fm-scroll-x" tabIndex={0} role="region" aria-label="Items in Trash">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="px-4 py-2">Name</th>
              <th className="px-2 py-2">Type</th>
              <th className="px-2 py-2">Client</th>
              <th className="px-2 py-2">Moved to Trash</th>
              <th className="px-4 py-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={`${it.kind}-${it.id}`} className="border-t border-line">
                <td className="px-4 py-2.5 font-semibold">
                  {it.name}
                  {it.kind === "client" && it.funnels > 0 && <span className="block text-xs font-normal text-muted">with {it.funnels} funnel{it.funnels === 1 ? "" : "s"}</span>}
                </td>
                <td className="px-2 py-2.5 text-muted">{it.kind === "client" ? "Client" : "Funnel"}</td>
                <td className="px-2 py-2.5 text-muted">{it.client || "–"}</td>
                <td className="px-2 py-2.5 text-muted">
                  <TimeAgo iso={it.deletedAt} />
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-2">
                    {canEdit && (
                      <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => restoreAction(it.kind, it.id), `“${it.name}” restored.`)} aria-label={`Restore ${it.name}`}>
                        Restore
                      </button>
                    )}
                    {canDeleteForever && (
                      <button
                        type="button"
                        className="btn sm danger"
                        disabled={pending}
                        aria-label={`Delete ${it.name} forever`}
                        onClick={async () => {
                          const ok = await ask({
                            title: "Delete forever?",
                            body: <p>“{it.name}”{it.kind === "client" && it.funnels ? ` and its ${it.funnels} funnel${it.funnels === 1 ? "" : "s"}` : ""} will be deleted forever, with versions, actuals and share links. This cannot be undone.</p>,
                            confirm: "Delete forever",
                            danger: true,
                          });
                          if (ok) run(() => deleteForeverAction(it.kind, it.id), `“${it.name}” deleted forever.`);
                        }}
                      >
                        Delete forever
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canDeleteForever && <p className="mt-3 text-xs text-muted">Only the workspace owner or an admin can delete forever.</p>}
      {dialog}
    </>
  );
}
