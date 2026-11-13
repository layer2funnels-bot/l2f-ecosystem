import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ORG_COOKIE = "fm-org";   // same name as lib/eco/server.ts (that module is server-only)

// Everything is private except sign-in/recovery, token-checked share links and the code-checked private sign-up.
const PUBLIC = ["/login", "/reset-password", "/auth/", "/s/", "/api/share/", "/api/version", "/robots.txt"];

/** Refreshes the Supabase session cookie on every request and guards private pages. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await sb.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  // Opened from the ecosystem Launcher with ?org=<id>: remember that organization and drop the parameter. It is only a preference: the
  // organization is used only if it is one of the person's own (lib/eco/server.ts currentOrg), and the API checks every call.
  const want = request.nextUrl.searchParams.get("org");
  if (user && want !== null) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("org");
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(want))
      res.cookies.set(ORG_COOKIE, want.toLowerCase(), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
