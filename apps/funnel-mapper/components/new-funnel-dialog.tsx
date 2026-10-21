"use client";
import { useActionState, useId, useRef, useState } from "react";
import { FormMessage, Submit } from "./form-bits";
import { Icon } from "./icon";
import { blankCustom, TemplateFields } from "./template-customize";
import { createFunnelAction } from "@/app/(app)/actions";
import { TEMPLATE13_BY_KEY } from "@/lib/templates13";

export interface TemplateOption {
  value: string;
  label: string;
  group: string;
}

export function NewFunnelButton({
  clients,
  clientId,
  templates,
  className = "btn primary",
  label = "New funnel",
  defaultSource = "blank",
}: {
  clients: { id: string; name: string }[];
  clientId?: string;
  templates: TemplateOption[];
  className?: string;
  label?: string;
  defaultSource?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [open, setOpen] = useState(false); // the form is mounted only while the dialog is open (a page can hold several of these buttons without repeating every field)
  const [state, action] = useActionState(createFunnelAction, undefined);
  const [source, setSource] = useState(defaultSource);
  const [custom, setCustom] = useState(blankCustom);
  const t13 = source.startsWith("builtin:")
    ? TEMPLATE13_BY_KEY[source.slice(8)]
    : undefined;
  const groups = [...new Set(templates.map((t) => t.group))];
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => (setOpen(true), ref.current?.showModal())}
        aria-haspopup="dialog"
      >
        <Icon name="plus" /> {label}
      </button>
      <dialog
        ref={ref}
        className="modal"
        aria-labelledby={`${uid}-title`}
        onClose={() => setOpen(false)}
      >
        <h3 id={`${uid}-title`}>
          {t13 ? `Customize ${t13.name}` : "New funnel"}
        </h3>
        {open && (
          <>
            {t13 && (
              <p className="help -mt-2 mb-3">
                All optional. Name it and point each page at its live URL, or
                skip and tweak later.
              </p>
            )}
            {clients.length === 0 ? (
              <p className="text-sm text-muted">
                Add a client first: every funnel belongs to a client portfolio.
              </p>
            ) : (
              <form action={action}>
                <FormMessage state={state} />
                <div className="field">
                  <label htmlFor={`${uid}-nf-client`}>Client</label>
                  <select
                    className="input"
                    id={`${uid}-nf-client`}
                    name="client_id"
                    defaultValue={clientId ?? clients[0]?.id}
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${uid}-nf-source`}>Start from</label>
                  <select
                    className="input"
                    id={`${uid}-nf-source`}
                    name="source"
                    value={source}
                    onChange={(e) => (
                      setSource(e.target.value),
                      setCustom(blankCustom())
                    )}
                  >
                    <option value="blank">Blank canvas</option>
                    {groups.map((g) => (
                      <optgroup key={g} label={g}>
                        {templates
                          .filter((t) => t.group === g)
                          .map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${uid}-nf-name`}>
                    Funnel name (optional)
                  </label>
                  <input
                    className="input"
                    id={`${uid}-nf-name`}
                    name="name"
                    placeholder="Uses the template name if empty"
                  />
                </div>
                {t13 && (
                  <>
                    <TemplateFields
                      templateKey={t13.key}
                      value={custom}
                      onChange={setCustom}
                    />
                    <input
                      type="hidden"
                      name="custom"
                      value={JSON.stringify(custom)}
                    />
                  </>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => ref.current?.close()}
                  >
                    Cancel
                  </button>
                  {t13 && (
                    <button type="submit" name="skip" value="1" className="btn">
                      Skip, use defaults
                    </button>
                  )}
                  <Submit className="btn primary">Create funnel</Submit>
                </div>
              </form>
            )}
            {clients.length === 0 && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="btn"
                  onClick={() => ref.current?.close()}
                >
                  Close
                </button>
              </div>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
