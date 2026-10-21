import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Signed-in user who isn't an active team member (deactivated): sign them out and explain. */
export async function GET(request: NextRequest) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/login?error=Your+access+to+this+workspace+has+been+removed.+Ask+an+admin+if+this+is+a+mistake.", request.nextUrl.origin));
}
