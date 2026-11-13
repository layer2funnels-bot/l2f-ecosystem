"use client";
import { useActionState } from "react";
import { FormMessage, Submit, useKeepingForm } from "@/components/form-bits";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/graph";
import { updateWorkspaceAction } from "../actions";

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
