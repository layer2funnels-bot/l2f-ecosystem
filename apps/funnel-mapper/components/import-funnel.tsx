"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "./icon";
import { importFunnelAction } from "@/app/(app)/actions";

/** Import a .json funnel file (from this app or the original prototype) as a new funnel for the client. */
export function ImportFunnelButton({ clientId }: { clientId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn" disabled={pending} onClick={() => input.current?.click()}>
        <Icon name="upload" /> {pending ? "Importing…" : "Import .json"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import funnel file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const text = await f.text();
          start(async () => {
            setErr("");
            const r = await importFunnelAction(clientId, text);
            if (r?.error) setErr(r.error);
            else if (r?.id) router.push(`/funnels/${r.id}`);
          });
        }}
      />
      {err && (
        <p role="alert" className="w-full text-sm text-bad">
          {err}
        </p>
      )}
    </>
  );
}
