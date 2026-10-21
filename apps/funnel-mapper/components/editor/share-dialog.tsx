"use client";
// Share (V2): permission View / Comment / Edit, numbers, funnel notes, expiry, a live preview of what the client sees,
// and every link with its permission state, copy and revoke. Links live in share_links (RLS: workspace writers).
import { forwardRef, useCallback, useEffect, useState } from "react";
import { GraphThumb } from "@/components/graph-thumb";
import { BrandMark, Icon } from "@/components/icon";
import { fmtDate } from "@/lib/format";
import type { ShareLinkRow } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { setSettings, useEditor } from "@/lib/editor/store";
import { Seg } from "./fields";

type Perm = "view" | "comment" | "edit";
const PERM_LABEL: Record<Perm, string> = { view: "View", comment: "Comment", edit: "Edit" };
const PERM_HELP: Record<Perm, string> = {
  view: "They see the map and can zoom around. No comments, no changes.",
  comment: "They see the map and can leave comments on steps, and reply.",
  edit: "They can move blocks and edit the map, and comment. Their changes save to the funnel.",
};
const permOf = (l: Pick<ShareLinkRow, "can_edit" | "allow_comments">): Perm => (l.can_edit ? "edit" : l.allow_comments ? "comment" : "view");
const flags = (p: Perm) => ({ can_edit: p === "edit", allow_comments: p !== "view" });
const EXPIRY: [string, string][] = [
  ["0", "Never"],
  ["7", "In 7 days"],
  ["30", "In 30 days"],
  ["90", "In 90 days"],
  ["date", "On a date…"],
];

export interface ShareDialogProps {
  funnelId: string;
  open: boolean;
  clientName: string;
  clientLogo: string | null;
  agencyName: string;
  agencyLogo: string | null;
}

export const ShareDialog = forwardRef<HTMLDialogElement, ShareDialogProps>(function ShareDialog({ funnelId, open, clientName, clientLogo, agencyName, agencyLogo }, ref) {
  const [links, setLinks] = useState<ShareLinkRow[]>([]);
  const [perm, setPerm] = useState<Perm>("comment");
  const [showNums, setShowNums] = useState(true);
  const [expires, setExpires] = useState("0");
  const [date, setDate] = useState("");
  const [copied, setCopied] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const notesShared = useEditor((s) => s.settings.notes.shared);
  const hasNotes = useEditor((s) => !!s.settings.notes.body.trim());
  const nodes = useEditor((s) => s.nodes);
  const edges = useEditor((s) => s.edges);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("share_links").select("*").eq("funnel_id", funnelId).order("created_at", { ascending: false });
    setLinks(data ?? []);
  }, [funnelId]);
  useEffect(() => {
     
    if (open) load();
  }, [open, load]);
  const expiresAt = () => {
    if (expires === "date") return date ? new Date(`${date}T23:59:59`).toISOString() : null;
    const days = Number(expires);
    return days ? new Date(Date.now() + days * 86400000).toISOString() : null;
  };
  const create = async () => {
    setErr("");
    if (expires === "date" && !date) return setErr("Pick the date the link should stop working.");
    if (expires === "date" && Date.parse(`${date}T23:59:59`) < Date.now()) return setErr("That date has already passed.");
    setBusy(true);
    const { error } = await supabaseBrowser()
      .from("share_links")
      .insert({ funnel_id: funnelId, ...flags(perm), hide_numbers: !showNums, expires_at: expiresAt() });
    setBusy(false);
    if (error) return setErr(error.message);
    load();
  };
  const update = async (id: string, patch: Partial<Pick<ShareLinkRow, "can_edit" | "allow_comments" | "hide_numbers">>) => {
    const { error } = await supabaseBrowser().from("share_links").update(patch).eq("id", id);
    if (error) setErr(error.message);
    load();
  };
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${origin}/s/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setErr("Couldn’t copy. Select the link and copy it by hand.");
    }
  };
  const preview = (
    <div className="fm-sharepreview" aria-label={`Preview of what ${clientName} sees`}>
      <header>
        <span className="logos">
          {agencyLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agencyLogo} alt="" />
          ) : (
            <BrandMark size={22} />
          )}
          <i aria-hidden="true">×</i>
          {clientLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={clientLogo} alt="" />
          ) : (
            <b aria-hidden="true">{clientName.slice(0, 1).toUpperCase()}</b>
          )}
        </span>
        <span className="who">
          {agencyName || "Your agency"} for {clientName}
        </span>
      </header>
      <GraphThumb graph={{ nodes, edges }} settings={useEditor.getState().settings} name="the shared map" className="map" />
      <ul>
        <li>{PERM_LABEL[perm]} access</li>
        <li>{showNums ? "Numbers shown" : "Journey only, no numbers"}</li>
        <li>{notesShared && hasNotes ? "Funnel notes shown" : "Internal notes stay hidden"}</li>
        <li>Internal checklists and screenshots stay hidden</li>
      </ul>
    </div>
  );
  return (
    <dialog ref={ref} className="modal fm-sharedlg" aria-labelledby="share-title">
      <h3 id="share-title">Share with {clientName || "your client"}</h3>
      <p className="mb-4 text-sm text-muted">Anyone with the link can open it, with your agency name and the client’s logo. No sign-in needed.</p>
      <div className="fm-sharegrid">
        <div className="min-w-0">
          <div className="fm-sharebox">
            <div className="field">
              <span className="lbl">They can</span>
              <Seg<Perm> label="Permission" value={perm} options={(Object.keys(PERM_LABEL) as Perm[]).map((k) => [k, PERM_LABEL[k]])} onChange={setPerm} />
              <span className="help">{PERM_HELP[perm]}</span>
            </div>
            <label className="check">
              <input type="checkbox" role="switch" checked={showNums} onChange={(e) => setShowNums(e.target.checked)} /> Show numbers
            </label>
            {!showNums && <p className="help -mt-1 mb-2">Prices, rates, costs and results are removed before the page reaches them. Editing is off for these links.</p>}
            <label className="check">
              <input type="checkbox" role="switch" checked={notesShared} onChange={(e) => setSettings({ notes: { body: useEditor.getState().settings.notes.body, shared: e.target.checked } })} /> Show the funnel notes
            </label>
            <p className="help -mt-1 mb-2">Applies to every link of this funnel. Block notes, checklists and screenshots are always internal.</p>
            <div className="field mb-3 max-w-[300px]">
              <label htmlFor="share-exp">Link expires</label>
              <select id="share-exp" className="input" value={expires} onChange={(e) => setExpires(e.target.value)}>
                {EXPIRY.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {expires === "date" && <input className="input mt-2" type="date" aria-label="Expiry date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />}
            </div>
            <button type="button" className="btn primary" onClick={create} disabled={busy}>
              <Icon name="link" /> Create link
            </button>
          </div>
          <details className="fm-sharepreview-fold">
            <summary>Preview what {clientName || "your client"} sees</summary>
            {preview}
          </details>
          <div className="fm-sharelinks">
          {err && (
            <p role="alert" className="mb-2 text-sm text-bad">
              {err}
            </p>
          )}
          <h4 className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Links ({links.length})</h4>
          {links.length === 0 && <p className="text-sm text-muted">No links yet. Create one on the left.</p>}
          {links.length > 0 && (
            <ul className="m-0 mb-2 list-none p-0">
              {links.map((l) => {
                const expired = !!l.expires_at && Date.parse(l.expires_at) < Date.now();
                return (
                  <li key={l.id} className="border-b border-line py-2.5">
                    <input className="input min-h-[32px]! py-1! text-xs" readOnly value={`${origin}/s/${l.token}`} aria-label="Share link" onFocus={(e) => e.target.select()} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
                      <select className="input w-auto! min-h-[28px]! py-0! text-xs" aria-label="Permission for this link" value={permOf(l)} onChange={(e) => update(l.id, flags(e.target.value as Perm))}>
                        {(Object.keys(PERM_LABEL) as Perm[]).map((k) => (
                          <option key={k} value={k}>
                            {PERM_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="pill bg-brand-soft text-brand" aria-pressed={l.hide_numbers} onClick={() => update(l.id, { hide_numbers: !l.hide_numbers })} title="Switch numbers on or off for this link">
                        {l.hide_numbers ? "Numbers hidden" : "Numbers shown"}
                      </button>
                      <span className={`pill ${expired ? "st-past" : "st-draft"}`}>{l.expires_at ? `${expired ? "Expired" : "Expires"} ${fmtDate(l.expires_at)}` : "No expiry"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="btn sm" onClick={() => copy(l.token)}>
                        {copied === l.token ? "Copied" : "Copy link"}
                      </button>
                      <a className="btn sm" href={`/s/${l.token}`} target="_blank" rel="noreferrer">
                        Open
                      </a>
                      <button
                        type="button"
                        className="btn sm danger"
                        onClick={async () => {
                          if (!confirm("Revoke this link? Anyone using it loses access.")) return;
                          await supabaseBrowser().from("share_links").delete().eq("id", l.id);
                          load();
                        }}
                      >
                        Revoke
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>
        <aside className="fm-sharepane" aria-label={`What ${clientName || "your client"} sees`}>
          <div className="fm-sharepane-h">
            <h4>What {clientName || "your client"} sees</h4>
            <form method="dialog">
              <button className="btn icon ghost" aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </form>
          </div>
          <div className="fm-sharepreview-wide">{preview}</div>
          <p className="help">Updates live as you change the settings. Your branding comes from Settings › Workspace.</p>
        </aside>
      </div>
      <form method="dialog" className="fm-sharedone">
        <button className="btn">Done</button>
      </form>
    </dialog>
  );
});
