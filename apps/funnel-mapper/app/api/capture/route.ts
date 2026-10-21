import { NextResponse } from "next/server";
import { z } from "zod";
import { CaptureError, captureProviderFromEnv, validateCaptureUrl } from "@/lib/capture";
import { supabaseServer } from "@/lib/supabase/server";
import { ImageRejected, optimiseImage, optimisePicture } from "@/lib/image-pipeline";
import { picPath } from "@/lib/shot-path";

export const runtime = "nodejs";
export const maxDuration = 30;

const body = z.object({ url: z.string().max(2000), nodeId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

// per-instance limiter: capture calls a paid third-party service
const hits = new Map<string, number[]>();
function limited(user: string) {
  const now = Date.now(),
    list = (hits.get(user) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(user, list);
  return list.length > 12;
}

/** POST { url, nodeId } → captures the page, stores it in the team's private `screenshots` bucket and returns its path. */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: "Send a page address." }, { status: 400 });
  const check = validateCaptureUrl(parsed.data.url);
  if (!check.ok) return NextResponse.json({ error: "bad_url", message: check.reason }, { status: 422 });
  const provider = captureProviderFromEnv();
  if (limited(user.id)) return NextResponse.json({ error: "rate_limited", message: "Too many captures. Try again in a minute." }, { status: 429 });
  try {
    const raw = await provider.capture(check.url);
    // F7: every stored image is under 100 KB (WebP, at most 1200px wide)
    const img = await optimiseImage(Buffer.from(raw.bytes), "shot");
    const path = `${user.id}/shot-${parsed.data.nodeId}-${Date.now()}.webp`;
    // the user's own client: storage RLS decides (viewers can't write)
    const { error } = await sb.storage.from("screenshots").upload(path, img.bytes, { contentType: img.type, upsert: true, cacheControl: "3600" });
    if (error) return NextResponse.json({ error: "forbidden", message: "You can’t add screenshots in this workspace." }, { status: 403 });
    // the 208 x 256 picture the block shows on the map; the capture itself is still saved if this part fails (the map falls back to it)
    const pic = await optimisePicture(Buffer.from(raw.bytes)).catch(() => null);
    if (pic) await sb.storage.from("screenshots").upload(picPath(path), pic.bytes, { contentType: pic.type, upsert: true, cacheControl: "3600" });
    return NextResponse.json({ path, bytes: img.bytes.byteLength });
  } catch (e) {
    if (e instanceof ImageRejected) return NextResponse.json({ error: "too_big", message: e.message }, { status: 422 });
    const code = e instanceof CaptureError ? e.code : "failed";
    return NextResponse.json({ error: code, message: e instanceof CaptureError ? e.message : "The page couldn’t be captured." }, { status: code === "timeout" ? 504 : 502 });
  }
}
