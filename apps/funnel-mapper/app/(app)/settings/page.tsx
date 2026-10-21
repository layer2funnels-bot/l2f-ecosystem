import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppearancePicker } from "@/components/theme-toggle";
import { ROLE_HELP, ROLE_LABEL } from "@/lib/roles";
import { requireUser } from "@/lib/supabase/server";
import { SettingsNav } from "./settings-nav";
import { AgencyLogo, IndependentForm, InviteForm, MemberRow, ProfileForm, WorkspaceForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { sb, user, profile, workspace, role, isAdmin, isOwner, isTeam } = await requireUser();
  const { data: rows } = await sb.from("workspace_members").select("user_id, role, active").eq("workspace_id", workspace.id).order("created_at");
  const { data: people } = await sb.from("profiles").select("id, full_name, email").in("id", (rows ?? []).map((m) => m.user_id));
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const members = (rows ?? []).map((m) => ({ id: m.user_id, role: m.role, active: m.active, full_name: byId.get(m.user_id)?.full_name ?? "", email: byId.get(m.user_id)?.email ?? "" }));
  const canInvite = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const joinCode = process.env.INDEPENDENT_SIGNUP_CODE ?? "";
  const joinUrl = canInvite && joinCode.length >= 8 ? `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/join/${joinCode}` : "";
  const sections = [
    { id: "profile", label: "Profile" },
    { id: "workspace", label: "Workspace & branding" },
    { id: "team", label: "Team" },
    ...(isTeam && isOwner ? [{ id: "independent", label: "Independent accounts" }] : []),
    { id: "appearance", label: "Appearance" },
    { id: "account", label: "Account" },
  ];
  return (
    <div className="max-w-[1180px]">
      <PageHeader title="Settings" sub={isTeam ? "Your profile, the team workspace and its branding." : "Your profile, your private workspace and its branding."} />
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <SettingsNav sections={sections} />
      <div id="fm-settings" data-pane="profile" className="fm-panes min-w-0">
      <section id="profile" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="profile-h">
        <h2 id="profile-h" className="mb-4 font-display text-lg font-bold">
          Your profile
        </h2>
        <ProfileForm fullName={profile.full_name} email={user.email ?? ""} role={role} />
      </section>

      <section id="workspace" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="brand-h">
        <h2 id="brand-h" className="mb-1 font-display text-lg font-bold">
          Workspace
        </h2>
        <p className="mb-3 text-sm" data-testid="current-workspace">
          You’re in <b>{workspace.agency_name}</b> <span className="pill bg-brand-soft text-brand">{isTeam ? "Layer2Funnels team workspace" : "Private workspace"}</span>
          <span className="mt-1 block text-muted">
            {isTeam ? "Shared with everyone on the Layer2Funnels team." : "Only this workspace’s members can see its clients, funnels, templates and files."}
          </span>
        </p>
        <h3 className="mb-1 text-sm font-bold">Branding</h3>
        <p className="mb-4 text-sm text-muted">Shown on client share links and PDF reports, next to the client’s logo.{!isAdmin && " Only admins can change it."}</p>
        <WorkspaceForm agencyName={workspace.agency_name} currency={workspace.default_currency} disabled={!isAdmin} />
        <div className="mt-4">
          <span className="mb-2 block text-[13px] font-bold">Agency logo</span>
          {isAdmin ? (
            <AgencyLogo url={workspace.agency_logo_url} />
          ) : workspace.agency_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.agency_logo_url} alt="Agency logo" className="h-16 w-16 rounded-xl border border-line bg-white object-contain" />
          ) : (
            <p className="text-sm text-muted">No logo yet.</p>
          )}
        </div>
      </section>

      <section id="team" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="team-h">
          <h2 id="team-h" className="mb-1 font-display text-lg font-bold">
            Team
          </h2>
          <p className="mb-2 text-sm text-muted">Everyone listed here shares this workspace’s clients, funnels and templates, and nothing else. There is no public sign-up: people join by invite only.</p>
          <p className="eyebrow mb-1">Roles</p>
          <dl className="fm-roles">
            {(["owner", "admin", "editor", "viewer"] as const).map((r) => (
              <div key={r}>
                <dt>{ROLE_LABEL[r]}</dt>
                <dd>{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
          {isAdmin && (
            <div className="mb-5 rounded-xl border border-line p-4">
              <h3 className="mb-2 text-sm font-bold">Invite a teammate</h3>
              {canInvite ? (
                <InviteForm />
              ) : (
                <p className="text-sm text-muted">
                  Invite from Supabase → Authentication → Users → <b>Invite user</b>. (To invite from here, set <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server. See the README.)
                </p>
              )}
            </div>
          )}
          <ul className="m-0 list-none p-0" aria-label="Team members">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} me={m.id === user.id} canManage={isAdmin} isOwner={isOwner} canRemove={isAdmin && canInvite} />
            ))}
          </ul>
      </section>

      {isTeam && isOwner && (
        <section id="independent" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="indep-h">
          <h2 id="indep-h" className="mb-1 font-display text-lg font-bold">
            Independent accounts
          </h2>
          <p className="mb-4 text-sm text-muted">
            Create an account for someone outside the team. They get their own private workspace: they can’t see Layer2Funnels clients, funnels or templates, and the team can’t see theirs.
          </p>
          {canInvite ? (
            <IndependentForm />
          ) : (
            <p className="text-sm text-muted">
              Needs <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server.
            </p>
          )}
          {joinUrl && (
            <div className="mt-4 text-sm">
              <span className="mb-1 block font-bold">Private sign-up link</span>
              <p className="m-0 text-muted">Anyone with this link can create their own independent workspace. Share it only with people you choose.</p>
              <code className="mt-1 block break-all rounded-lg border border-line px-2 py-1" data-testid="join-url">
                {joinUrl}
              </code>
            </div>
          )}
        </section>
      )}

      <section id="appearance" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="look-h">
        <h2 id="look-h" className="mb-1 font-display text-lg font-bold">
          Appearance
        </h2>
        <p className="mb-4 text-sm text-muted">Choose how the whole app looks. It is remembered for you on every device.</p>
        <AppearancePicker />
      </section>
      <section id="account" className="fm-pane" aria-labelledby="acct-h">
        <h2 id="acct-h" className="mb-3 font-display text-lg font-bold">
          Account
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/update-password" className="btn">
            Change password
          </Link>
          <form action="/auth/signout" method="post">
            <button className="btn">Sign out</button>
          </form>
        </div>
      </section>
      </div>
      </div>
    </div>
  );
}
