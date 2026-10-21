import type { Metadata } from "next";
import { Editor } from "@/components/editor/editor";
import { BrandMark } from "@/components/icon";
import { getShared } from "@/lib/share/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const d = await getShared(token);
  return { title: d ? `${d.funnel.name} · ${d.client.name}` : "Link not available", robots: { index: false, follow: false } };
}

/** Public share page: read-only (or editable) funnel, branded with the agency name and the client's logo. */
export default async function SharePage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const d = await getShared(token);
  if (!d)
    return (
      <main className="dotgrid grid min-h-full place-items-center px-4">
        <div className="card max-w-[440px] p-8 text-center">
          <div className="mb-3 flex justify-center">
            <BrandMark size={40} />
          </div>
          <h1 className="mb-2 font-display text-2xl font-bold">This link is no longer active</h1>
          <p className="text-sm text-muted">It may have expired or been switched off. Ask the person who sent it for a new link. Nothing on your side needs fixing.</p>
        </div>
      </main>
    );
  return (
    <Editor
      mode="share"
      funnel={{ id: d.funnel.id, name: d.funnel.name, description: d.funnel.description, status: d.funnel.status, client_id: "", graph: d.graph, settings: d.settings, updated_at: d.funnel.updated_at }}
      client={{ id: "", name: d.client.business_name || d.client.name, logo_url: d.client.logo_url, currency: d.settings.currency }}
      agency={{ name: d.agency.name ?? "", logo_url: d.agency.logo_url }}
      share={{ token, canEdit: d.link.can_edit, hideNumbers: d.link.hide_numbers || d.settings.hideNumbers, allowComments: d.link.allow_comments, comments: d.comments }}
    />
  );
}
