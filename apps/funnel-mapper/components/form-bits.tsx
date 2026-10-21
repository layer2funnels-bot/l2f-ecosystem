"use client";
import { useFormStatus } from "react-dom";
import { useTransition, type FormEvent } from "react";

/**
 * Submit a form to a server action WITHOUT React resetting it afterwards. A `<form action>` is reset to its first values when
 * the action finishes, which put a just-saved currency or name back to the old one on screen (so people saved it again).
 * Use for settings forms that stay on screen: `<form onSubmit={submit}>` and `<Submit pending={pending}>`.
 */
export function useKeepingForm(action: (fd: FormData) => void) {
  const [pending, start] = useTransition();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(() => action(fd));
  };
  return { submit, pending };
}

export function Submit({ children, className = "btn primary w-full", pending: pendingProp }: { children: React.ReactNode; className?: string; pending?: boolean }) {
  const status = useFormStatus().pending;
  const pending = pendingProp ?? status;
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { error?: string; message?: string } }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "color-mix(in srgb, var(--bad) 10%, transparent)", color: "var(--bad)" }}>
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="mb-3 rounded-lg bg-brand-soft px-3 py-2 text-sm">
        {state.message}
      </p>
    );
  return null;
}
