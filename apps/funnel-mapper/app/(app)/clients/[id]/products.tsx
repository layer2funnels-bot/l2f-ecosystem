"use client";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { INT_LABEL, typeOf, type Interval, baseOf } from "@/lib/catalog";
import { money } from "@/lib/format";
import type { ProductRow } from "@/lib/schemas";
import { deleteProductAction, saveProductAction, type ProductInput } from "../../actions";

const OFFER_TYPES = ["checkout", "product", "bump", "upsell", "downsell", "sub", "trial", "plan", "hightick", "service", "digital", "coursep", "coaching", "membership", "oto", "bundle", "coupon", "freeoffer"] as const;
type P = ProductInput["params"];

function describe(type: string, p: P, cur: string) {
  const eff = (p.price ?? 0) * (1 - (p.disc ?? 0) / 100);
  if (baseOf(type) === "sub") return `${money(eff, cur)}/${INT_LABEL[(p.interval ?? "monthly") as Interval]} · ${p.life ?? 0} mo avg${p.trialDays ? ` · ${p.trialDays}-day trial` : ""}`;
  if (baseOf(type) === "plan") return `${p.pays ?? 1} × ${money(eff, cur)}`;
  return money(eff, cur);
}

/** Reusable offers for this client (and agency-wide ones). They appear in the editor palette, ready to drop in. */
export function ProductLibrary({ clientId, products, currency, readOnly = false }: { clientId: string; products: ProductRow[]; currency: string; readOnly?: boolean }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [edit, setEdit] = useState<ProductRow | null>(null);
  const [pending, start] = useTransition();
  const open = (p: ProductRow | null) => {
    setEdit(p);
    dlg.current?.showModal();
  };
  return (
    <section aria-labelledby="products-h">
      <div className="mb-3 flex items-center gap-2">
        <h2 id="products-h" className="flex-1 font-display text-xl font-bold">
          Products <span className="text-base font-medium text-muted">({products.length})</span>
        </h2>
        {!readOnly && (
          <button type="button" className="btn" onClick={() => open(null)}>
            <Icon name="plus" /> Add product
          </button>
        )}
      </div>
      {products.length === 0 ? (
        <div className="card px-6 py-8 text-center text-sm text-muted">Save this client’s offers once (price, buy rate, billing) and drop them into any funnel from the editor’s palette.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl fm-stackrows fm-prodrows text-sm">
            <thead>
              <tr>
                <th className="pl-4">Product</th>
                <th>Type</th>
                <th>Pricing</th>
                <th className="r">Buy rate</th>
                <th className="pr-4" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const params = p.params as P;
                return (
                  <tr key={p.id}>
                    <td className="pl-4 font-bold">
                      {p.name}
                      {!p.client_id && <span className="ml-2 pill bg-brand-soft text-brand">Agency-wide</span>}
                    </td>
                    <td data-label="Type">{typeOf(p.type)?.label ?? p.type}</td>
                    <td data-label="Pricing">{describe(p.type, params, currency)}</td>
                    <td className="r" data-label="Buy rate">{params.cr ?? 0}%</td>
                    <td className="r pr-4 whitespace-nowrap">
                      {!readOnly && (
                      <>
                      <button type="button" className="btn sm icon" aria-label={`Edit ${p.name}`} onClick={() => open(p)}>
                        <Icon name="edit" size={16} />
                      </button>{" "}
                      <button
                        type="button"
                        className="btn sm icon danger"
                        aria-label={`Delete ${p.name}`}
                        disabled={pending}
                        onClick={() => confirm(`Delete “${p.name}”?`) && start(() => deleteProductAction(p.id, clientId))}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                      </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <dialog ref={dlg} className="modal" aria-labelledby="prod-title" onClose={() => setEdit(null)}>
        <ProductForm key={edit?.id ?? "new"} clientId={clientId} product={edit} onDone={() => dlg.current?.close()} />
      </dialog>
    </section>
  );
}

function ProductForm({ clientId, product, onDone }: { clientId: string; product: ProductRow | null; onDone: () => void }) {
  const [type, setType] = useState(product?.type ?? "product");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const init = { ...typeOf(type)?.d, ...((product?.params as P) ?? {}) } as P;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const n = (k: string) => (fd.get(k) == null || fd.get(k) === "" ? undefined : Number(fd.get(k)));
        const input: ProductInput = {
          id: product?.id,
          client_id: fd.get("scope") === "agency" ? null : clientId,
          name: String(fd.get("name") ?? ""),
          type: type as ProductInput["type"],
          notes: String(fd.get("notes") ?? ""),
          params: {
            price: n("price") ?? 0,
            cr: n("cr") ?? 0,
            newc: fd.get("newc") === "on",
            disc: n("disc") ?? 0,
            refund: n("refund") ?? 0,
            fulfil: n("fulfil") ?? 0,
            aff: n("aff") ?? 0,
            ...(baseOf(type) === "sub" ? { interval: (fd.get("interval") as Interval) ?? "monthly", life: n("life") ?? 0, trialDays: n("trialDays") ?? 0, trialPrice: n("trialPrice") ?? 0, setup: n("setup") ?? 0 } : {}),
            ...(baseOf(type) === "plan" ? { pays: n("pays") ?? 1, interval: (fd.get("interval") as Interval) ?? "monthly" } : {}),
          },
        };
        start(async () => {
          const r = await saveProductAction(input);
          if (r?.error) setErr(r.error);
          else onDone();
        });
      }}
    >
      <h3 id="prod-title">{product ? "Edit product" : "Add product"}</h3>
      {err && (
        <p role="alert" className="mb-3 text-sm text-bad">
          {err}
        </p>
      )}
      <div className="row2">
        <div className="field">
          <label htmlFor="pf-name">Name</label>
          <input className="input" id="pf-name" name="name" defaultValue={product?.name ?? ""} required />
        </div>
        <div className="field">
          <label htmlFor="pf-type">Offer type</label>
          <select className="input" id="pf-type" value={type} onChange={(e) => setType(e.target.value)}>
            {OFFER_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeOf(t).label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="pf-price">{baseOf(type) === "sub" ? "Price per period" : baseOf(type) === "plan" ? "Each payment" : "Price"}</label>
          <input className="input" id="pf-price" name="price" type="number" min="0" step="any" defaultValue={init.price ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="pf-cr">Typical buy rate (%)</label>
          <input className="input" id="pf-cr" name="cr" type="number" min="0" max="100" step="any" defaultValue={init.cr ?? 10} />
        </div>
      </div>
      {baseOf(type) === "sub" && (
        <>
          <div className="row2">
            <div className="field">
              <label htmlFor="pf-int">Billing</label>
              <select className="input" id="pf-int" name="interval" defaultValue={init.interval ?? "monthly"}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pf-life">Average months retained</label>
              <input className="input" id="pf-life" name="life" type="number" min="0" step="any" defaultValue={init.life ?? 6} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="pf-td">Trial days</label>
              <input className="input" id="pf-td" name="trialDays" type="number" min="0" step="any" defaultValue={init.trialDays ?? 0} />
            </div>
            <div className="field">
              <label htmlFor="pf-tp">Trial price</label>
              <input className="input" id="pf-tp" name="trialPrice" type="number" min="0" step="any" defaultValue={init.trialPrice ?? 0} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pf-setup">Setup fee</label>
            <input className="input" id="pf-setup" name="setup" type="number" min="0" step="any" defaultValue={init.setup ?? 0} />
          </div>
        </>
      )}
      {baseOf(type) === "plan" && (
        <div className="row2">
          <div className="field">
            <label htmlFor="pf-pays">Number of payments</label>
            <input className="input" id="pf-pays" name="pays" type="number" min="1" step="1" defaultValue={init.pays ?? 3} />
          </div>
          <div className="field">
            <label htmlFor="pf-pint">Paid every</label>
            <select className="input" id="pf-pint" name="interval" defaultValue={init.interval ?? "monthly"}>
              <option value="weekly">Week</option>
              <option value="monthly">Month</option>
              <option value="quarterly">Quarter</option>
            </select>
          </div>
        </div>
      )}
      <div className="row2">
        <div className="field">
          <label htmlFor="pf-disc">Discount (%)</label>
          <input className="input" id="pf-disc" name="disc" type="number" min="0" max="100" step="any" defaultValue={init.disc ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="pf-ref">Refund rate (%)</label>
          <input className="input" id="pf-ref" name="refund" type="number" min="0" max="100" step="any" defaultValue={init.refund ?? 0} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="pf-ful">Delivery cost per sale</label>
          <input className="input" id="pf-ful" name="fulfil" type="number" min="0" step="any" defaultValue={init.fulfil ?? 0} />
        </div>
        <div className="field">
          <label htmlFor="pf-aff">Affiliate commission (%)</label>
          <input className="input" id="pf-aff" name="aff" type="number" min="0" max="100" step="any" defaultValue={init.aff ?? 0} />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" name="newc" defaultChecked={!!init.newc} /> Counts as a new customer
      </label>
      <div className="field">
        <label htmlFor="pf-scope">Available to</label>
        <select className="input" id="pf-scope" name="scope" defaultValue={product && !product.client_id ? "agency" : "client"}>
          <option value="client">This client only</option>
          <option value="agency">All clients (agency-wide)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="pf-notes">Notes</label>
        <textarea className="input" id="pf-notes" name="notes" defaultValue={product?.notes ?? ""} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
