// One sign-in for every ecosystem app (owner, 13 Nov 2026). The ecosystem web app keeps the session in ONE cookie on the shared domain
// (apps/web/js/session.js sharedSessionStore); Funnel Mapper reads that cookie and has no sign-in of its own. When the token is about
// to expire Funnel Mapper renews it and writes the cookie back, so the web app picks up the new one (it re-reads the cookie before it
// renews; sending an old refresh token twice would make the sign-in service end the session everywhere).
// Used by the proxy (edge) and the server: no server-only imports here.

export const SESSION_COOKIE = "l2f-session";
export type SharedSession = { access: string; refresh: string; expiresAt: number; email: string | null; userId: string | null; name: string | null };

export function parseSession(raw: string | undefined | null): SharedSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SharedSession>;
    return typeof s.access === "string" && s.access && typeof s.expiresAt === "number"
      ? { access: s.access, refresh: typeof s.refresh === "string" ? s.refresh : "", expiresAt: s.expiresAt, email: s.email ?? null, userId: s.userId ?? null, name: s.name ?? null }
      : null;
  } catch {
    return null;
  }
}

/** The same cookie the web app writes: whole domain (ECOSYSTEM_COOKIE_DOMAIN), every path, Lax, Secure on https, 30 days, readable by the page. */
export function cookieOptions(secure: boolean, maxAge = 30 * 86400) {
  const domain = (process.env.ECOSYSTEM_COOKIE_DOMAIN ?? "").trim();
  return { path: "/", sameSite: "lax" as const, secure, httpOnly: false, maxAge, ...(domain ? { domain } : {}) };
}

/** Renews the session with the sign-in service (public key only); null when it can't be renewed (signed out elsewhere, expired). */
export async function renewSession(s: SharedSession, fetchImpl: typeof fetch = fetch): Promise<SharedSession | null> {
  if (!s.refresh) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  try {
    const r = await fetchImpl(`${base}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: key },
      body: JSON.stringify({ refresh_token: s.refresh }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const b = (await r.json()) as { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { email?: string; id?: string; user_metadata?: { full_name?: string } } };
    if (!b.access_token) return null;
    return {
      access: b.access_token,
      refresh: b.refresh_token ?? s.refresh,
      expiresAt: b.expires_at ? b.expires_at * 1000 : Date.now() + (b.expires_in ?? 3600) * 1000,
      email: b.user?.email ?? s.email,
      userId: b.user?.id ?? s.userId,
      name: b.user?.user_metadata?.full_name ?? s.name,
    };
  } catch {
    return null;
  }
}

/** The ecosystem sign-in page, which sends the person back to `returnUrl` afterwards (only configured app addresses; apps/web config.js appOrigins). */
export function signInUrl(returnUrl: string): string | null {
  const web = (process.env.ECOSYSTEM_WEB_URL ?? "").replace(/\/$/, "");
  return web ? `${web}/#/signin?return=${encodeURIComponent(returnUrl)}` : null;
}

/** Who the token says the person is (display only: every read and write is checked by the ecosystem API, which verifies the token). */
export function tokenClaims(access: string): { sub: string | null; email: string | null } {
  try {
    const p = JSON.parse(atob(access.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string; email?: string };
    return { sub: p.sub ?? null, email: p.email ?? null };
  } catch {
    return { sub: null, email: null };
  }
}
