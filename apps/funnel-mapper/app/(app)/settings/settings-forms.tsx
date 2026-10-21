"use client";
import { useActionState, useState, useTransition } from "react";
import { FormMessage, Submit, useKeepingForm } from "@/components/form-bits";
import { LogoUpload } from "@/components/logo-upload";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/graph";
import { ROLE_HELP, ROLE_LABEL, roleLabel, type Role } from "@/lib/roles";
import { createIndependentAccountAction, inviteMemberAction, removeMemberAction, setMemberAction, transferOwnershipAction, updateAgencyLogo, updateProfileAction, updateWorkspaceAction, type AssignableRole } from "../actions";

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

export function WorkspaceForm({ agencyName, currency, disabled }: { agencyName: string; currency: string; disabled: boolean }) {
  const [state, action] = useActionState(updateWorkspaceAction, undefined);
  const { submit, pending } = useKeepingForm(action);
  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled} className="m-0 border-0 p-0">
        <FormMessage state={state?.error ? state : state?.ok ? { message: "Saved" } : undefined} />
        <div className="row2">
          <div className="field">
            <label htmlFor="ws-agency">Agency name</label>
            <input className="input" id="ws-agency" name="agency_name" defaultValue={agencyName} autoComplete="organization" />
          </div>
          <div className="field">
            <label htmlFor="ws-cur">Default currency</label>
            <select className="input" id="ws-cur" name="default_currency" defaultValue={currency}>
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCIES[c].label}
                </option>
              ))}
            </select>
            <span className="help">Used for new clients. Each client and funnel can override it.</span>
          </div>
        </div>
        {!disabled && <Submit className="btn primary" pending={pending}>Save branding</Submit>}
      </fieldset>
    </form>
  );
}

export function AgencyLogo({ url }: { url: string | null }) {
  const [u, setU] = useState(url);
  return (
    <LogoUpload
      url={u}
      name="agency"
      label="Logo"
      onChange={async (next) => {
        await updateAgencyLogo(next);
        setU(next);
      }}
    />
  );
}

export function InviteForm() {
  const [state, action] = useActionState(inviteMemberAction, undefined);
  return (
    <form action={action}>
      <FormMessage state={state?.error ? state : state?.added ? { message: "Added. They already have an account and can switch to this workspace from the menu." } : state?.ok ? { message: "Invite sent. They’ll get an email to choose a password." } : undefined} />
      <div className="row2">
        <div className="field">
          <label htmlFor="inv-email">Email</label>
          <input className="input" id="inv-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="inv-name">Name (optional)</label>
          <input className="input" id="inv-name" name="full_name" autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="inv-role">Role</label>
        <select className="input" id="inv-role" name="role" defaultValue="editor">
          {(["editor", "viewer", "admin"] as const).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}: {ROLE_HELP[r].toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <Submit className="btn primary">Send invite</Submit>
    </form>
  );
}

export function IndependentForm() {
  const [state, action] = useActionState(createIndependentAccountAction, undefined);
  return (
    <form action={action}>
      <FormMessage state={state?.error ? state : state?.ok ? { message: "Account created. They’ll get an email to choose a password and open their private workspace." } : undefined} />
      <div className="row2">
        <div className="field">
          <label htmlFor="ind-email">Email</label>
          <input className="input" id="ind-email" name="email" type="email" required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="ind-name">Name (optional)</label>
          <input className="input" id="ind-name" name="full_name" autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ind-ws">Workspace name (optional)</label>
        <input className="input" id="ind-ws" name="workspace_name" autoComplete="off" />
      </div>
      <Submit className="btn primary">Create independent account</Submit>
    </form>
  );
}

type Member = { id: string; full_name: string; email: string; role: string; active: boolean };

export function MemberRow({ member: m, me, canManage, isOwner, canRemove }: { member: Member; me: boolean; canManage: boolean; isOwner: boolean; canRemove: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (patch: { role?: AssignableRole; active?: boolean }) =>
    start(async () => {
      setErr("");
      const r = await setMemberAction(m.id, patch);
      if (r?.error) setErr(r.error);
    });
  const handover = () =>
    confirm(`Make ${m.full_name || m.email} the owner of this workspace? You’ll become an admin.`) &&
    start(async () => {
      setErr("");
      const r = await transferOwnershipAction(m.id);
      if (r?.error) setErr(r.error);
    });
  return (
    <li className={`flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0 ${m.active ? "" : "bg-bg"}`}>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft font-bold text-brand" aria-hidden="true">
        {(m.full_name || m.email).slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-[1_1_170px]">
        <div className="truncate text-sm font-bold">
          {m.full_name || m.email}
          {me && <span className="ml-1 font-normal text-muted">(you)</span>}
        </div>
        <div className="truncate text-xs text-muted">{m.email}</div>
      </div>
      {!m.active && <span className="pill st-past">Deactivated</span>}
      {canManage && !me && m.role !== "owner" ? (
        <>
          <label className="sr-only" htmlFor={`role-${m.id}`}>
            Role for {m.email}
          </label>
          <select id={`role-${m.id}`} className="input min-h-[32px]! w-auto py-1! text-sm" value={m.role} disabled={pending} onChange={(e) => run({ role: e.target.value as AssignableRole })} title={ROLE_HELP[m.role as Role]}>
            {(["admin", "editor", "viewer"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {isOwner && m.active && (
            <button type="button" className="btn sm" disabled={pending} onClick={handover}>
              Make owner
            </button>
          )}
          <button type="button" className={`btn sm ${m.active ? "danger" : ""}`} disabled={pending} onClick={() => (m.active ? confirm(`Remove ${m.email}'s access? They’re signed out and can’t see anything until reactivated.`) && run({ active: false }) : run({ active: true }))}>
            {m.active ? "Deactivate" : "Reactivate"}
          </button>
          {canRemove && (
            <button
              type="button"
              className="btn sm danger"
              disabled={pending}
              onClick={() =>
                confirm(`Remove ${m.email} from the team?\n\nTheir account and email are deleted and they can’t sign in again (you can invite them later). Their clients, funnels and templates are kept and transferred to you.`) &&
                start(async () => {
                  setErr("");
                  const r = await removeMemberAction(m.id);
                  if (r?.error) setErr(r.error);
                })
              }
            >
              Remove
            </button>
          )}
        </>
      ) : (
        <span className="pill bg-brand-soft text-brand" title={ROLE_HELP[m.role as Role]}>
          {roleLabel(m.role)}
        </span>
      )}
      {err && (
        <p role="alert" className="w-full text-sm text-bad">
          {err}
        </p>
      )}
    </li>
  );
}
