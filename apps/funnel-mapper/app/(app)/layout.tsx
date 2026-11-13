import { AppNav } from "@/components/app-nav";
import { TopStrip } from "@/components/top-strip";
import { templateOptions } from "@/lib/queries";
import { roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/supabase/server";
import { funnelCounts, listClients } from "@/lib/eco/data";
import { launcherUrl, profileUrl } from "@/lib/eco/core";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, profile, workspace, workspaces, role, isTeam, canEdit } = await requireUser();
  // everything the shell needs, fetched at once
  const [all, templates, counts] = await Promise.all([listClients(), canEdit ? templateOptions(isTeam ? "Team templates" : "Your templates") : Promise.resolve([]), funnelCounts()]);
  const live = all.filter((c) => !c.archived_at);
  const clients = canEdit ? live.map((c) => ({ id: c.id, name: c.name })) : [];
  const nr = { data: canEdit ? all.map((c) => ({ niche: c.niche })) : [] };
  // pinned clients in the sidebar: the first few that are in play
  const pin = { data: live.filter((c) => ["active", "proposal", "lead"].includes(c.status)).slice(0, 3).map((c) => ({ id: c.id, name: c.name, status: c.status })) };
  const niches = [...new Set((nr.data ?? []).map((c) => c.niche).filter(Boolean))];
  return (
    <div className="min-h-full lg:flex">
      <AppNav agency={workspace.agency_name || "Layer2Funnels"} user={profile.full_name || user.email || ""} role={roleLabel(role)} logo={workspace.agency_logo_url} team={isTeam} workspaceId={workspace.id} workspaces={workspaces} appsUrl={launcherUrl()} profileUrl={profileUrl()} trash={counts.trashed + counts.trashed_clients} pinned={pin.data ?? []} counts={{ "/clients": live.length, "/funnels": counts.active }} />
      <div className="min-w-0 flex-1">
        <TopStrip canEdit={canEdit} clients={clients} templates={templates} defaultCurrency={workspace.default_currency} niches={niches} />
        <main id="main" className="px-4 py-6 pb-24 sm:px-6 sm:pb-6 lg:px-10 lg:pt-7 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
