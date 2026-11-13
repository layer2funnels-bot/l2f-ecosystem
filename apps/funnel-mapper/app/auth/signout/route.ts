import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieOptions, parseSession, signInUrl } from "@/lib/eco/shared-session";

/** Sign out of every app: ends the session at the sign-in service, removes the shared cookie, then shows the ecosystem sign-in page. */
export async function POST(request: NextRequest) {
  const s = parseSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (s?.access) {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    await fetch(`${base}/auth/v1/logout`, { method: "POST", headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", authorization: `Bearer ${s.access}` }, cache: "no-store" }).catch(() => null);
  }
  const web = (process.env.ECOSYSTEM_WEB_URL ?? "").replace(/\/$/, "");
  const res = NextResponse.redirect(web ? `${web}/#/signin` : (signInUrl(request.nextUrl.origin) ?? new URL("/", request.nextUrl.origin).toString()), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(request.nextUrl.protocol === "https:", 0));
  return res;
}
