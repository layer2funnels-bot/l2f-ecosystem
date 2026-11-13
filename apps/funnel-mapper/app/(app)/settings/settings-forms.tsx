"use client";
import { useActionState } from "react";
import { FormMessage, Submit, useKeepingForm } from "@/components/form-bits";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/graph";
import { ROLE_HELP, roleLabel, type Role } from "@/lib/roles";
import { updateProfileAction, updateWorkspaceAction } from "../actions";

export function ProfileForm({ fullName, email, role }: { fullName: string; email: string; role: string }) {
  const [state, action] = useActionState(updateProfileAction, undefined);
  const { submit, pending } = useKeepingForm(action);
  return (
    <form onSubmit={submit}>
      <FormMessage state={state?.error ? state : state?.ok ? { message: "Saved" } : undefined} />
      <div className="row2">
        <div className="field">
          <label htmlFor="pf-name">Your name</label>
          <input className="input" id="pf-name" name="full_name" defaultValue={fullName} autoComplete="name" />
        </div>
        <div className="field">
          <span className="lbl">Email</span>
          <p className="m-0 py-2 text-sm">
            {email} · <span className="pill bg-brand-soft text-brand" title={ROLE_HELP[role as Role]}>{roleLabel(role)}</span>
          </p>
        </div>
      </div>
      <Submit className="btn primary" pending={pending}>Save</Submit>
    </form>
  );
}

export function WorkspaceForm({ currency, disabled }: { currency: string; disabled: boolean }) {
  const [state, action] = useActionState(updateWorkspaceAction, undefined);
  const { submit, pending } = useKeepingForm(action);
  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <FormMessage state={state?.error ? state : state?.ok ? { message: "Saved" } : undefined} />
        <div className="field max-w-sm">
          <label htmlFor="ws-cur">Default currency</label>
          <select className="input" id="ws-cur" name="default_currency" defaultValue={currency}>
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {CURRENCIES[c].label}
              </option>
            ))}
          </select>
          <span className="help">Used for new clients and funnels. Each client and funnel can override it.{disabled && " Only owners and admins can change it."}</span>
        </div>
        {!disabled && <Submit className="btn primary" pending={pending}>Save</Submit>}
      </fieldset>
    </form>
  );
}
