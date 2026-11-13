import { NextResponse } from "next/server";
import { z } from "zod";
import { CaptureError, captureProviderFromEnv, validateCaptureUrl } from "@/lib/capture";
import { accessToken } from "@/lib/eco/server";

const body = z.object({ url: z.string().max(2000), nodeId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

// per-instance limiter: capture calls a paid third-party service
const hits = new Map<string, number[]>();
function limited(key: string) {
  const now = Date.now(),
    list = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(key, list);
  return list.length > 12;
}

/**
 * POST { url, nodeId } → the page capture as an image. The browser makes it small (under 100 KB) and stores it in the organization's
 * files, like an uploaded screenshot; the capture service's address and key stay on the server.
 */
export async function POST(req: Request) {
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: "Send a page address." }, { status: 400 });
  const check = validateCaptureUrl(parsed.data.url);
  if (!check.ok) return NextResponse.json({ error: "bad_url", message: check.reason }, { status: 422 });
  const provider = captureProviderFromEnv();
  if (limited(token.slice(-24))) return NextResponse.json({ error: "rate_limited", message: "Too many captures. Try again in a minute." }, { status: 429 });
  try {
    const raw = await provider.capture(check.url);
    return new NextResponse(new Uint8Array(raw.bytes), { headers: { "content-type": raw.type, "cache-control": "no-store" } });
  } catch (e) {
    const code = e instanceof CaptureError ? e.code : "failed";
    return NextResponse.json({ error: code, message: e instanceof CaptureError ? e.message : "The page couldn’t be captured." }, { status: code === "unavailable" ? 503 : code === "timeout" ? 504 : 502 });
  }
}
