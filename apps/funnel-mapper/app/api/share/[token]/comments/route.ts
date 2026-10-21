import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { anonClient, tokenSchema } from "@/lib/share/server";

const body = z.object({ author: z.string().trim().max(120).default(""), body: z.string().trim().min(1, "Write a comment").max(4000), node_id: z.string().max(64).optional().default("") });

/** Leave a comment on a shared funnel (allow_comments checked in the DB). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/share/[token]/comments">) {
  const { token } = await ctx.params;
  if (!tokenSchema.safeParse(token).success) return NextResponse.json({ error: "Bad token" }, { status: 400 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0].message }, { status: 400 });
  const { data, error } = await anonClient().rpc("add_share_comment", { p_token: token, p_node_id: p.data.node_id, p_author: p.data.author, p_body: p.data.body });
  if (error) return NextResponse.json({ error: "Comments are closed for this link" }, { status: 403 });
  return NextResponse.json({ id: data });
}
