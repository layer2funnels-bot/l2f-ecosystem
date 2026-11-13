import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { AppearancePicker } from "@/components/theme-toggle";
import { ROLE_HELP, ROLE_LABEL } from "@/lib/roles";
import { requireUser } from "@/lib/supabase/server";
import { SettingsNav } from "./settings-nav";
import { ProfileForm, WorkspaceForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile, workspace, role, isAdmin } = await requireUser();
  // people, roles, invitations and branding belong to the organization and are managed once, in Office › Admin
  const office = (process.env.ECOSYSTEM_WEB_URL ?? "").replace(/\/$/, "");
  const sections = [
    { id: "profile", label: "Profile" },
    { id: "workspace", label: "Organization" },
    { id: "team", label: "Team" },
    { id: "appearance", label: "Appearance" },
    { id: "account", label: "Account" },
  ];
  return (
    <div className="max-w-[1180px]">
      <PageHeader title="Settings" sub="Your profile, Funnel Mapper’s settings for this organization, and how the app looks." />
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
          Organization
        </h2>
        <p className="mb-4 text-sm" data-testid="current-workspace">
          You’re working in <b>{workspace.agency_name}</b>.
          <span className="mt-1 block text-muted">Its name, logo and branding are set in Office › Admin and used by every app, including client share links and PDF reports.</span>
        </p>
        <WorkspaceForm currency={workspace.default_currency} disabled={!isAdmin} />
      </section>

      <section id="team" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="team-h">
        <h2 id="team-h" className="mb-1 font-display text-lg font-bold">
          Team
        </h2>
        <p className="mb-3 text-sm text-muted">
          People, invitations and roles are managed for the whole organization in Office › Admin. What someone may see in Funnel Mapper follows their role there, including any limit to particular clients.
        </p>
        <dl className="fm-roles">
          {(["owner", "admin", "editor", "viewer"] as const).map((r) => (
            <div key={r}>
              <dt>{ROLE_LABEL[r]}</dt>
              <dd>{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
        {office && (
          <a className="btn mt-4" href={`${office}/#/office/admin`}>
            Open Office › Admin
          </a>
        )}
      </section>

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
