import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { AppearancePicker } from "@/components/theme-toggle";
import { requireUser } from "@/lib/supabase/server";
import { SettingsNav } from "./settings-nav";
import { WorkspaceForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

/**
 * Only Funnel Mapper's own settings. Your profile, your account, the organization and its people are the ecosystem's, shared by every
 * app, and are changed there (profile menu, Office › Admin), not here.
 */
export default async function SettingsPage() {
  const { workspace, isAdmin } = await requireUser();
  const sections = [
    { id: "funnel-mapper", label: "Funnel Mapper" },
    { id: "appearance", label: "Appearance" },
  ];
  return (
    <div className="max-w-[1180px]">
      <PageHeader title="Settings" sub="Funnel Mapper’s own settings." />
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav sections={sections} />
        <div id="fm-settings" data-pane="funnel-mapper" className="fm-panes min-w-0">
          <section id="funnel-mapper" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="fm-h">
            <h2 id="fm-h" className="mb-4 font-display text-lg font-bold">
              Funnel Mapper
            </h2>
            <WorkspaceForm currency={workspace.default_currency} disabled={!isAdmin} />
          </section>
          <section id="appearance" className="fm-pane card mb-6 scroll-mt-24 p-6" aria-labelledby="look-h">
            <h2 id="look-h" className="mb-1 font-display text-lg font-bold">
              Appearance
            </h2>
            <p className="mb-4 text-sm text-muted">Choose how Funnel Mapper looks on this device.</p>
            <AppearancePicker />
          </section>
        </div>
      </div>
    </div>
  );
}
