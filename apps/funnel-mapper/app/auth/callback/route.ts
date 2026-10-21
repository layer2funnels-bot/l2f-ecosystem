import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** PKCE callback for magic links, sign-up confirmation and password reset emails. Links that carry the session in
 *  the URL fragment instead (Supabase's standard invite link) have no `code`: hand them to /auth/accept, which can
 *  read the fragment (browsers keep it across this redirect). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  if (!code && !url.searchParams.get("error")) return NextResponse.redirect(new URL(`/auth/accept?next=${encodeURIComponent(next)}`, url.origin));
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=That+link+is+invalid+or+has+expired.+Please+try+again.", url.origin));
}
