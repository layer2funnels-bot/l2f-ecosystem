import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieOptions, parseSession, renewSession, signInUrl } from "@/lib/eco/shared-session";

// Everything is private except token-checked share links (and their API), the version probe, robots.txt and sign-out.
const PUBLIC = ["/s/", "/api/share/", "/api/version", "/robots.txt", "/auth/signout"];

/**
 * One sign-in for every app: Funnel Mapper has no sign-in page. It reads the ecosystem's shared session cookie, renews it shortly before it
 * expires (and writes it back for the other apps), and sends anyone without a session to the ecosystem sign-in page, which brings them back.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC.some((p) => path.startsWith(p))) return NextResponse.next({ request });
  const secure = request.nextUrl.protocol === "https:";
  let s = parseSession(request.cookies.get(SESSION_COOKIE)?.value);
  let renewed = false;
  if (s && s.expiresAt - Date.now() < 60_000) {
    s = await renewSession(s);
    renewed = true;
  }
  if (!s) {
    // come back to the same page, on Funnel Mapper's configured public address (the request's own host can differ behind a proxy)
    const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "") || request.nextUrl.origin;
    const to = signInUrl(`${site}${path}${request.nextUrl.search}`);
    const res = to ? NextResponse.redirect(to) : new NextResponse("Sign-in isn’t set up for Funnel Mapper (ECOSYSTEM_WEB_URL).", { status: 503 });
    if (renewed) res.cookies.set(SESSION_COOKIE, "", cookieOptions(secure, 0));   // the session ended elsewhere: clear it here too
    return res;
  }
  if (!renewed) return NextResponse.next({ request });
  const value = JSON.stringify(s);
  request.cookies.set(SESSION_COOKIE, value);   // this request's pages see the new token
  const res = NextResponse.next({ request });
  res.cookies.set(SESSION_COOKIE, value, cookieOptions(secure));   // and so do the other apps on the domain
  return res;
}
