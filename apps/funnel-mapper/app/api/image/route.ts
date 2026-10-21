import { NextResponse } from "next/server";
import { ImageRejected, MAX_INPUT_BYTES, optimiseImage, optimisePicture, sizeLine, type ImageKind } from "@/lib/image-pipeline";
import { picPath } from "@/lib/shot-path";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Which bucket each upload goes to, and how it is sized (V2 F7). Logos are public; screenshots are private to the team.
const TARGETS: Record<string, { bucket: "logos" | "screenshots"; kind: ImageKind }> = {
  logo: { bucket: "logos", kind: "logo" },
  shot: { bucket: "screenshots", kind: "shot" },
  icon: { bucket: "logos", kind: "icon" },
};
const ACCEPT = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/;

/** POST multipart { file, target: logo | shot | icon, name } → optimised under 100 KB, stored, path / URL returned. */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const target = TARGETS[String(form?.get("target") ?? "")];
  const name = String(form?.get("name") ?? "image");
  if (!(file instanceof File) || !target || !/^[A-Za-z0-9_-]{1,80}$/.test(name)) return NextResponse.json({ error: "bad_request", message: "Choose an image to upload." }, { status: 400 });
  if (!ACCEPT.test(file.type) || (target.bucket === "screenshots" && /svg|gif/.test(file.type))) return NextResponse.json({ error: "bad_type", message: target.bucket === "screenshots" ? "Use a PNG, JPG or WebP." : "Use a PNG, JPG, WebP, SVG or GIF." }, { status: 415 });
  if (file.size > MAX_INPUT_BYTES) return NextResponse.json({ error: "too_big", message: "This image is over 25 MB. Choose a smaller file." }, { status: 413 });
  try {
    const out = await optimiseImage(Buffer.from(await file.arrayBuffer()), target.kind);
    const path = `${user.id}/${name}-${Date.now()}.webp`;
    // the user's own client: storage RLS decides who may write (viewers can't)
    const { error } = await sb.storage.from(target.bucket).upload(path, out.bytes, { contentType: out.type, upsert: true, cacheControl: "3600" });
    if (error) return NextResponse.json({ error: "forbidden", message: "You can’t add images in this workspace." }, { status: 403 });
    if (target.kind === "shot") {
      // the 208 x 256 picture the block shows on the map (the map falls back to the full image when it is missing)
      const pic = await optimisePicture(Buffer.from(await file.arrayBuffer())).catch(() => null);
      if (pic) await sb.storage.from(target.bucket).upload(picPath(path), pic.bytes, { contentType: pic.type, upsert: true, cacheControl: "3600" });
    }
    const url = target.bucket === "logos" ? sb.storage.from("logos").getPublicUrl(path).data.publicUrl : null;
    return NextResponse.json({ path, url, bytes: out.bytes.byteLength, before: file.size, line: `Optimised ${sizeLine(file.size, out.bytes.byteLength)}` });
  } catch (e) {
    if (e instanceof ImageRejected) return NextResponse.json({ error: "rejected", message: e.message }, { status: 422 });
    return NextResponse.json({ error: "failed", message: "The image couldn’t be processed. Try again." }, { status: 500 });
  }
}
