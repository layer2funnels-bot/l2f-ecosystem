import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EcoHeader } from "@/components/eco-header";
import { Editor } from "@/components/editor/editor";
import { TrashedNotice } from "@/components/trashed-notice";
import type { PaletteProduct } from "@/components/editor/palette";
import { parseGraph, parseSettings } from "@/lib/graph";
import { roleLabel } from "@/lib/roles";
import { requireUser } from "@/lib/supabase/server";

export async function generateMetadata({ params }: PageProps<"/funnels/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { sb } = await requireUser();
  const { data } = await sb.from("funnels").select("name").eq("id", id).maybeSingle();
  return { title: data?.name ?? "Funnel" };
}

export default async function FunnelPage({ params }: PageProps<"/funnels/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { sb, user, profile, workspace, workspaces, role, isTeam, isAdmin, canEdit } = await requireUser();
  const { data: f } = await sb.from("funnels").select("*").eq("id", id).maybeSingle();
  if (!f) notFound();
  if (f.deleted_at)
    return (
      <main id="main" className="min-h-full px-4">
        <TrashedNotice kind="funnel" id={f.id} name={f.name} canEdit={canEdit} />
      </main>
    );
  const [{ data: client }, { data: products }, { data: lastVersion }, { count }] = await Promise.all([
    sb.from("clients").select("id, name, logo_url, currency").eq("id", f.client_id).single(),
    sb.from("products").select("id, name, type, params").or(`client_id.eq.${f.client_id},client_id.is.null`).order("name"),
    sb.from("funnel_versions").select("created_at").eq("funnel_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("share_comments").select("id", { count: "exact", head: true }).eq("funnel_id", id).eq("resolved", false),
  ]);
  if (!client) notFound();
  return (
    <>
      <EcoHeader
        compact
        org={workspace.agency_name || "Layer2Funnels"}
        workspaceId={workspace.id}
        workspaces={workspaces}
        canCreateWorkspace={isAdmin}
        team={isTeam}
        logo={workspace.agency_logo_url}
        user={profile.full_name || user.email || ""}
        email={user.email ?? ""}
        role={roleLabel(role)}
        launcherUrl={process.env.ECOSYSTEM_LAUNCHER_URL ?? ""}
      />
      <Editor
        mode="owner"
        userId={user.id}
        userName={profile.full_name || user.email || ""}
        funnel={{ id: f.id, name: f.name, description: f.description, status: f.status, client_id: f.client_id, graph: parseGraph(f.graph), settings: parseSettings(f.settings), updated_at: f.updated_at }}
        client={client}
        agency={{ name: workspace.agency_name, logo_url: workspace.agency_logo_url }}
        products={(products ?? []) as PaletteProduct[]}
        lastVersionAt={lastVersion ? Date.parse(lastVersion.created_at) : 0}
        unresolvedComments={count ?? 0}
        viewer={!canEdit}
      />
    </>
  );
}
