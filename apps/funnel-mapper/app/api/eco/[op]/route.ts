import { NextResponse, type NextRequest } from "next/server";
import { BROWSER_OPS } from "@/lib/eco/core";
import { eco } from "@/lib/eco/server";

const siteOrigin = () => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").origin;
  } catch {
    return null;
  }
};

/**
 * Browser relay to the ecosystem API: same site (no cross-site requests), the person's own session, only Funnel Mapper's operations.
 * It grants nothing: the ecosystem API and database decide every call.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  if (!BROWSER_OPS.test(op)) return NextResponse.json({ ok: false, error: { code: "not_found", message: "Not found." } }, { status: 404 });
  // same site only: Funnel Mapper's own address as the request arrived, or its configured public address (behind the ecosystem's /fmp
  // gateway or another proxy the server can see itself under a different host than the browser does)
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && origin !== siteOrigin()) return NextResponse.json({ ok: false, error: { code: "not_found", message: "Not found." } }, { status: 404 });
  const input = await req.json().catch(() => ({}));
  const r = await eco(op, input);
  return r.ok ? NextResponse.json({ ok: true, data: r.data }) : NextResponse.json({ ok: false, error: { code: r.code, message: r.message, fields: r.fields } }, { status: r.status || 503 });
}
