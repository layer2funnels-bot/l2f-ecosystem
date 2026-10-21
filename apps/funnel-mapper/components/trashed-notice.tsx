"use client";
// Opening a client or funnel that is in Trash: say so, say nothing was lost, and offer to restore it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { restoreAction } from "@/app/(app)/actions";
import { Icon } from "./icon";

export function TrashedNotice({ kind, id, name, canEdit }: { kind: "client" | "funnel"; id: string; name: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  return (
    <div className="mx-auto my-16 max-w-[520px] card p-8 text-center" role="status">
      <Icon name="trash" size={28} className="mx-auto mb-3 text-muted" />
      <h1 className="mb-2 font-display text-2xl font-bold">“{name}” is in Trash</h1>
      <p className="mb-5 text-sm text-muted">
        Nothing was lost. {kind === "client" ? "The client and the funnels that went with it" : "The funnel"} can be restored at any time. Share links stay switched off until then.
      </p>
      {err && (
        <p className="mb-3 text-sm text-bad" role="alert">
          {err}
        </p>
      )}
      <div className="flex justify-center gap-2">
        <Link href="/trash" className="btn">
          Open Trash
        </Link>
        {canEdit && (
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await restoreAction(kind, id);
                if (r?.error) setErr(r.error);
                else router.refresh();
              })
            }
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
