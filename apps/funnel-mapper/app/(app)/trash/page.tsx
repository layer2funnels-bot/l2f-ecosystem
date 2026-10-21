import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/supabase/server";
import { TrashList, type TrashItem } from "./trash-list";

export const metadata: Metadata = { title: "Trash" };

/** Trash (V2 F6): clients and funnels moved to Trash. No time limit; nothing is removed automatically. */
export default async function TrashPage() {
  const { sb, canEdit, isAdmin } = await requireUser();
  const [{ data: clients }, { data: funnels }, { data: allClients }] = await Promise.all([
    sb.from("clients").select("id, name, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    sb.from("funnels").select("id, name, client_id, deleted_at").not("deleted_at", "is", null).order("deleted_at", { ascending: false }),
    sb.from("clients").select("id, name, deleted_at"),
  ]);
  const clientName = new Map((allClients ?? []).map((c) => [c.id, c.name]));
  const trashedClient = new Map((clients ?? []).map((c) => [c.id, c.deleted_at]));
  const items: TrashItem[] = [
    ...(clients ?? []).map((c) => ({ kind: "client" as const, id: c.id, name: c.name, client: "", deletedAt: c.deleted_at!, funnels: (funnels ?? []).filter((f) => f.client_id === c.id && f.deleted_at === c.deleted_at).length })),
    // funnels that went to Trash with their client are listed under the client, not on their own
    ...(funnels ?? []).filter((f) => trashedClient.get(f.client_id) !== f.deleted_at).map((f) => ({ kind: "funnel" as const, id: f.id, name: f.name, client: clientName.get(f.client_id) ?? "", deletedAt: f.deleted_at!, funnels: 0 })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return (
    <>
      <PageHeader title="Trash" sub="Clients and funnels stay here until someone restores them or deletes them forever. There is no time limit." />
      <TrashList items={items} canEdit={canEdit} canDeleteForever={isAdmin} />
    </>
  );
}
