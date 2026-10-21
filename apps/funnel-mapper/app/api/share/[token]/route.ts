import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { graphSchema, settingsSchema } from "@/lib/graph";
import { anonClient, getShared, tokenSchema } from "@/lib/share/server";

/** Read a shared funnel. The token is checked by the get_shared_funnel() RPC (existence + expiry). */
export async function GET(_: NextRequest, ctx: RouteContext<"/api/share/[token]">) {
  const { token } = await ctx.params;
  const d = await getShared(token);
  if (!d) return NextResponse.json({ error: "Link not found or expired" }, { status: 404 });
  return NextResponse.json(d, { headers: { "cache-control": "no-store" } });
}

const body = z.object({ graph: graphSchema, settings: settingsSchema });

/** Save edits from an editable share link (can_edit checked in the DB). */
export async function PUT(req: NextRequest, ctx: RouteContext<"/api/share/[token]">) {
  const { token } = await ctx.params;
  if (!tokenSchema.safeParse(token).success) return NextResponse.json({ error: "Bad token" }, { status: 400 });
  const raw = await req.json().catch(() => null);
  const p = body.safeParse(raw);
  if (!p.success) return NextResponse.json({ error: "Invalid funnel" }, { status: 400 });
  if (JSON.stringify(p.data).length > 2_000_000) return NextResponse.json({ error: "Too large" }, { status: 413 });
  const { error } = await anonClient().rpc("save_shared_funnel", { p_token: token, p_graph: p.data.graph as never, p_settings: p.data.settings as never });
  if (error) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
