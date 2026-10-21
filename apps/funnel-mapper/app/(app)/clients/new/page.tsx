import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ClientForm } from "@/components/client-form";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/supabase/server";
import { createClientAction } from "../../actions";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const { sb, workspace, canEdit } = await requireUser();
  if (!canEdit) redirect("/clients");
  const { data } = await sb.from("clients").select("niche");
  const niches = [...new Set((data ?? []).map((c) => c.niche).filter(Boolean))];
  return (
    <div className="max-w-[760px]">
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-brand">
        <Icon name="back" size={16} /> Clients
      </Link>
      <PageHeader title="New client" sub="Add their details. You can upload a logo and map funnels next." />
      <div className="card p-6">
        <ClientForm action={createClientAction} defaultCurrency={workspace.default_currency} submitLabel="Create client" niches={niches} />
      </div>
    </div>
  );
}
