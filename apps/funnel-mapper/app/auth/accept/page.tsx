"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Supabase's standard invite (and some recovery/magic) links verify the token on Supabase's side and come back with
 * the session in the URL fragment (#access_token=…), which the server never sees. Take it from the fragment, store
 * the session in the auth cookies, then continue: invites and recoveries go on to choose a password.
 */
export default function AcceptPage() {
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const q = new URLSearchParams(window.location.search);
    const fail = (m: string) => window.location.replace(`/login?error=${encodeURIComponent(m)}`);
    if (h.get("error_description")) return fail(h.get("error_description")!);
    const access_token = h.get("access_token"),
      refresh_token = h.get("refresh_token");
    if (!access_token || !refresh_token) return fail("That link is invalid or has expired. Please try again.");
    const n = q.get("next") ?? "/";
    const next = h.get("type") === "invite" || h.get("type") === "recovery" ? "/update-password" : n.startsWith("/") && !n.startsWith("//") ? n : "/";
    supabaseBrowser()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => (error ? fail("That link is invalid or has expired. Please try again.") : window.location.replace(next)));
  }, []);
  return (
    <main className="grid min-h-full place-items-center px-4">
      <p role="status" className="text-sm text-muted">
        Signing you in…
      </p>
    </main>
  );
}
