"use client";
import { useActionState, useId, useState } from "react";
import { FormMessage, Submit } from "./form-bits";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/graph";
import { CLIENT_STATUSES, STATUS_LABEL, type ClientRow } from "@/lib/schemas";
import { BILLING_FREQUENCIES, FREQUENCY_LABEL, PRICING_LABEL, PRICING_MODELS, pricingModel, type PricingModel } from "@/lib/pricing";
import type { ActionResult } from "@/app/(app)/actions";

type Action = (s: ActionResult, fd: FormData) => Promise<ActionResult>;

export function ClientForm({ action, client, defaultCurrency = "GBP", submitLabel = "Save client", niches = [], onCancel }: { action: Action; client?: Partial<ClientRow>; defaultCurrency?: string; submitLabel?: string; niches?: string[]; onCancel?: () => void }) {
  const [state, formAction] = useActionState(action, undefined);
  const c = client ?? {};
  const [model, setModel] = useState<PricingModel>(pricingModel(c));
  const p = `cf${useId().replace(/:/g, "")}`; // unique per form: the New client sheet and the Details tab can both be mounted
  return (
    <form action={formAction} noValidate>
      <FormMessage state={state?.error ? state : undefined} />
      <div className="row2">
        <div className="field">
          <label htmlFor={`${p}-name`}>Client name *</label>
          <input className="input" id={`${p}-name`} name="name" defaultValue={c.name ?? ""} required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${p}-status`}>Status *</label>
          <select className="input" id={`${p}-status`} name="status" defaultValue={c.status ?? "lead"}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${p}-currency`}>Currency *</label>
          <select className="input" id={`${p}-currency`} name="currency" defaultValue={c.currency ?? defaultCurrency}>
            {CURRENCY_CODES.map((k) => (
              <option key={k} value={k}>
                {CURRENCIES[k].label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${p}-pricing`}>Pricing model *</label>
          <select className="input" id={`${p}-pricing`} name="pricing_model" value={model} onChange={(e) => setModel(e.target.value as PricingModel)}>
            {PRICING_MODELS.map((m) => (
              <option key={m} value={m}>
                {PRICING_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <PricingFields model={model} c={c} p={p} />
      {/* V2 New client: the required fields first; everything else is one click away */}
      <details className="fm-moredetails" open={!!client?.id}>
        <summary>Add details</summary>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${p}-business`}>Business name</label>
          <input className="input" id={`${p}-business`} name="business_name" defaultValue={c.business_name ?? ""} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${p}-niche`}>Niche</label>
          <input className="input" id={`${p}-niche`} name="niche" list="niche-list" defaultValue={c.niche ?? ""} placeholder="Fitness, coaching…" />
          <datalist id="niche-list">
            {niches.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${p}-email`}>Email</label>
          <input className="input" id={`${p}-email`} name="email" type="email" defaultValue={c.email ?? ""} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${p}-phone`}>Phone</label>
          <input className="input" id={`${p}-phone`} name="phone" type="tel" defaultValue={c.phone ?? ""} autoComplete="off" />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor={`${p}-website`}>Website</label>
          <input className="input" id={`${p}-website`} name="website" defaultValue={c.website ?? ""} placeholder="https://" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${p}-country`}>Country</label>
          <input className="input" id={`${p}-country`} name="country" defaultValue={c.country ?? ""} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${p}-tags`}>Tags</label>
        <input className="input" id={`${p}-tags`} name="tags" defaultValue={(c.tags ?? []).join(", ")} placeholder="tripwire, retainer" />
        <span className="help">Separate tags with commas.</span>
      </div>
      {client?.id ? null : (
        <div className="field">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea className="input" id={`${p}-notes`} name="notes" defaultValue={c.notes ?? ""} />
        </div>
      )}
      </details>
      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <Submit className="btn primary">{submitLabel}</Submit>
        <span role="status" className="text-sm text-good">
          {state?.ok ? "Saved" : ""}
        </span>
      </div>
    </form>
  );
}

const amountProps = { className: "input", type: "number", min: "0", step: "any" } as const;

/** The inputs that apply to the chosen pricing model (the server clears the others on save). */
function PricingFields({ model, c, p }: { model: PricingModel; c: Partial<ClientRow>; p: string }) {
  const amount = (id: string, label: string, help?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input {...amountProps} id={id} name="pricing_amount" defaultValue={c.pricing_amount || ""} placeholder="0" />
      {help && <span className="help">{help}</span>}
    </div>
  );
  const date = (id: string, name: "project_start" | "project_end", label: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input className="input" id={id} name={name} type="date" defaultValue={c[name] ?? ""} />
    </div>
  );
  return (
    <>
      {model === "retainer" && (
        <div className="row2">
          <div className="field">
            <label htmlFor={`${p}-retainer`}>Monthly retainer</label>
            <input {...amountProps} id={`${p}-retainer`} name="monthly_retainer" defaultValue={c.monthly_retainer ?? 0} />
          </div>
        </div>
      )}
      {model === "fixed" && (
        <>
          <div className="row2">{amount(`${p}-amount`, "Project fee")}</div>
          <div className="row2">
            {date(`${p}-start`, "project_start", "Project start")}
            {date(`${p}-end`, "project_end", "Project end")}
          </div>
        </>
      )}
      {model === "one_time" && (
        <div className="row2">
          {amount(`${p}-amount`, "Amount")}
          {date(`${p}-start`, "project_start", "Date")}
        </div>
      )}
      {model === "hourly" && (
        <div className="row2">
          {amount(`${p}-amount`, "Hourly rate")}
          <div className="field">
            <label htmlFor={`${p}-hours`}>Estimated hours per month</label>
            <input {...amountProps} id={`${p}-hours`} name="hours_per_month" defaultValue={c.hours_per_month || ""} placeholder="0" />
          </div>
        </div>
      )}
      {model === "commission" && (
        <div className="row2">
          <div className="field">
            <label htmlFor={`${p}-commission`}>Commission (% of revenue)</label>
            <input {...amountProps} id={`${p}-commission`} name="commission_pct" max="100" defaultValue={c.commission_pct || ""} placeholder="0" />
          </div>
          {amount(`${p}-amount`, "Base fee per month (optional)")}
        </div>
      )}
      {model === "other" && (
        <div className="row2">
          {amount(`${p}-amount`, "Amount")}
          <div className="field">
            <label htmlFor={`${p}-frequency`}>Billed</label>
            <select className="input" id={`${p}-frequency`} name="billing_frequency" defaultValue={c.billing_frequency ?? "monthly"}>
              {BILLING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {FREQUENCY_LABEL[f]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor={`${p}-pricing-notes`}>Pricing notes</label>
        <input className="input" id={`${p}-pricing-notes`} name="pricing_notes" defaultValue={c.pricing_notes ?? ""} placeholder="Payment terms, milestones, what the commission is on…" maxLength={500} autoComplete="off" />
      </div>
    </>
  );
}
