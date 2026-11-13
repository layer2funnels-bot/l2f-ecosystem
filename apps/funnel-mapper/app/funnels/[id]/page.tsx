import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Editor } from "@/components/editor/editor";
import { TrashedNotice } from "@/components/trashed-notice";
import type { PaletteProduct } from "@/components/editor/palette";
import { parseGraph, parseSettings } from "@/lib/graph";
import { requireUser } from "@/lib/supabase/server";
import { eco } from "@/lib/eco/server";
import { getClient, getFunnel, listProducts } from "@/lib/eco/data";

export async function generateMetadata({ params }: PageProps<"/funnels/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Funnel" };
  await requireUser();
  const f = await getFunnel(id).catch(() => null);
  return { title: f?.name ?? "Funnel" };
}

export default async function FunnelPage({ params }: PageProps<"/funnels/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, profile, workspace, canEdit } = await requireUser();
  const f = await getFunnel(id);
  if (!f) notFound();
  if (f.deleted_at)
    return (
      <main id="main" className="min-h-full px-4">
        <TrashedNotice kind="funnel" id={f.id} name={f.name} canEdit={canEdit} />
      </main>
    );
  const [client, products, versions, comments] = await Promise.all([
    getClient(f.client_id),
    listProducts(f.client_id).catch(() => []),
    eco<{ created_at: string }>("fmp.versions.list", { funnel: id, limit: 1, with_graph: false }),
    eco<{ id: string }>("fmp.comments.list", { funnel: id, unresolved: true }),
  ]);
  if (!client) notFound();
  const lastVersion = versions.ok ? versions.data[0] : undefined;
  return (
    <Editor
      mode="owner"
      userId={user.id}
      userName={profile.full_name || user.email || ""}
      funnel={{ id: f.id, name: f.name, description: f.description, status: f.status as never, client_id: f.client_id, graph: parseGraph(f.graph), settings: parseSettings(f.settings), updated_at: f.updated_at }}
      client={{ id: client.id, name: client.name, logo_url: client.logo_url, currency: client.currency }}
      agency={{ name: workspace.agency_name, logo_url: workspace.agency_logo_url }}
      products={products.map((p) => ({ id: p.id, name: p.name, type: p.type, params: p.params })) as PaletteProduct[]}
      lastVersionAt={lastVersion ? Date.parse(lastVersion.created_at) : 0}
      unresolvedComments={comments.ok ? comments.data.length : 0}
      viewer={!canEdit}
    />
  );
}
