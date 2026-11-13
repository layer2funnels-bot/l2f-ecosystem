import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SwitchOrgButton } from "@/components/switch-org-button";
import { ECO_API, ecoFetch, launcherUrl } from "@/lib/eco/core";
import { accessToken, currentOrg } from "@/lib/eco/server";
import { signInUrl } from "@/lib/eco/shared-session";

export const metadata: Metadata = { title: "Funnel Mapper isn’t available" };

/**
 * Signed in, but Funnel Mapper isn't set up in this organization, or the person's role doesn't include it (V7 16 §4: Aurj shows
 * "isn't set up" + switch). Offers the person's other organizations where Funnel Mapper is available to them.
 */
export default async function UnavailablePage() {
  const token = await accessToken();
  if (!token) redirect(signInUrl(`${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")}/`) ?? "/");
  const { org, orgs } = await currentOrg();
  const usable = [];
  for (const o of orgs) {
    if (o.org_id === org?.org_id) continue;
    const r = await ecoFetch(ECO_API(), "fmp.settings.get", {}, token, o.org_id);
    if (r.ok && r.data.length) usable.push(o);
  }
  const apps = launcherUrl();
  return (
    <>
      <h1 className="mb-2 font-display text-xl font-bold">{org ? `Funnel Mapper isn’t set up for ${org.name}` : "Funnel Mapper isn’t available to you"}</h1>
      <p className="mb-4 text-sm text-muted">
        {usable.length
          ? `It’s on in ${usable.map((o) => o.name).join(" and ")}. Switch there to open your funnels.`
          : "Your account works, but Funnel Mapper isn’t switched on for your organization, or your role doesn’t include it. Ask an owner or admin to give you access in Office › Admin."}
      </p>
      <div className="flex flex-wrap gap-2">
        {usable.map((o) => (
          <SwitchOrgButton key={o.org_id} orgId={o.org_id} name={o.name} />
        ))}
        {apps && (
          <a className="btn" href={apps}>
            All apps
          </a>
        )}
        <form action="/auth/signout" method="post">
          <button className="btn">Sign out</button>
        </form>
      </div>
    </>
  );
}
