"use client";
// Delete confirmations (V2 F6, "V2-delete-confirm"): one centred dialog for every delete question.
//   * Move a funnel to Trash: a plain question; it can be restored.
//   * Move a client to Trash: the person types the client's name before the button turns on.
//   * Delete forever / Empty trash: asked once more, and it says it cannot be undone.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

export interface ConfirmOptions {
  title: string;
  body: React.ReactNode;
  confirm: string;
  /** Red button and "cannot be undone" wording. */
  danger?: boolean;
  /** The exact text the person must type before the button turns on (e.g. the client's name). */
  typeToConfirm?: string;
}

export function useConfirm(): [React.ReactNode, (o: ConfirmOptions) => Promise<boolean>] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const ask = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((res) => {
        resolver.current = res;
        setOpts(o);
      }),
    [],
  );
  const done = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  return [opts ? <ConfirmDialog key={opts.title} o={opts} onDone={done} /> : null, ask];
}

function ConfirmDialog({ o, onDone }: { o: ConfirmOptions; onDone: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const ok = !o.typeToConfirm || typed.trim() === o.typeToConfirm.trim();
  return (
    <dialog ref={ref} className="modal fm-confirm" aria-labelledby="cf-title" onCancel={(e) => (e.preventDefault(), onDone(false))}>
      <h3 id="cf-title" className={o.danger ? "danger" : undefined}>
        {o.danger && <Icon name="alert" size={18} />} {o.title}
      </h3>
      <div className="text-sm">{o.body}</div>
      {o.typeToConfirm && (
        <label className="field mt-3">
          <span className="lbl">
            Type <b>{o.typeToConfirm}</b> to confirm
          </span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus aria-label={`Type ${o.typeToConfirm} to confirm`} />
        </label>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => onDone(false)} autoFocus={!o.typeToConfirm}>
          Cancel
        </button>
        <button type="button" className={`btn ${o.danger ? "danger-solid" : "primary"}`} disabled={!ok} onClick={() => onDone(true)}>
          {o.confirm}
        </button>
      </div>
    </dialog>
  );
}
