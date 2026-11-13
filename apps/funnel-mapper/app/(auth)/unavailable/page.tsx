import type { Metadata } from "next";

export const metadata: Metadata = { title: "Funnel Mapper isn’t available" };

/** Signed in, but Funnel Mapper isn't switched on for any organization this person works in, or their role doesn't include it. */
export default function UnavailablePage() {
  const office = (process.env.ECOSYSTEM_WEB_URL ?? "").replace(/\/$/, "");
  return (
    <>
      <h1 className="mb-2 font-display text-xl font-bold">Funnel Mapper isn’t available to you</h1>
      <p className="mb-4 text-sm text-muted">
        Your account works, but Funnel Mapper isn’t switched on for your organization, or your role doesn’t include it. Ask your organization’s owner or an admin to give you access in Office › Admin.
      </p>
      <div className="flex flex-wrap gap-2">
        {office && (
          <a className="btn primary" href={office}>
            Back to the apps
          </a>
        )}
        <form action="/auth/signout" method="post">
          <button className="btn">Sign out</button>
        </form>
      </div>
    </>
  );
}
