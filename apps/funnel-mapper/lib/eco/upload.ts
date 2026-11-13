"use client";
import { ecoCall } from "./browser";

/** Puts an already-shrunk image (Funnel Mapper keeps every image under 100 KB) in the ecosystem file storage; returns its path. */
export async function uploadImage(blob: Blob, kind: "logo" | "thumb" | "shot" | "pic", of?: string): Promise<string> {
  const type = blob.type || "image/webp";
  const r = await ecoCall<{ path: string; url: string; method: string; headers: Record<string, string> }>("fmp.files.upload", { kind, size_bytes: blob.size, mime_type: type, ...(of ? { of } : {}) });
  if (!r.ok || !r.data[0]) throw new Error(r.ok ? "You can’t add images here." : r.message);
  const t = r.data[0];
  const put = await fetch(t.url, { method: t.method || "PUT", headers: { "content-type": type, ...t.headers }, body: blob });
  if (!put.ok) throw new Error("The image couldn’t be stored. Try again.");
  return t.path;
}

/** Short-lived addresses for stored images (paths); web addresses and data URLs are returned unchanged. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const todo = [...new Set(paths.filter(Boolean))];
  for (const p of todo) if (/^(https?:|data:)/.test(p)) out[p] = p;
  const stored = todo.filter((p) => !out[p]);
  for (let i = 0; i < stored.length; i += 100) {
    const r = await ecoCall<{ path: string; url: string }>("fmp.files.url", { paths: stored.slice(i, i + 100) });
    if (r.ok) for (const x of r.data) out[x.path] = x.url;
  }
  return out;
}

/** Stores a page capture (any size, from upload or the capture service) as Funnel Mapper does: the image plus the block's picture. */
export async function storeShot(raw: Blob): Promise<{ path: string; bytes: number }> {
  const { optimiseForStorage, pictureForBlock } = await import("@/lib/image-client");
  const img = await optimiseForStorage(raw, "shot");
  const path = await uploadImage(img, "shot");
  // the map falls back to the full capture when the picture can't be made
  await pictureForBlock(raw)
    .then((pic) => uploadImage(pic, "pic", path))
    .catch(() => null);
  return { path, bytes: img.size };
}

/** Asks the server for a page capture, then stores it like an uploaded screenshot. */
export async function captureAndStore(url: string, nodeId: string): Promise<{ path?: string; bytes?: number; message?: string; error?: string; status: number }> {
  const r = await fetch("/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, nodeId }) });
  if (!r.ok || !/^image\//.test(r.headers.get("content-type") ?? "")) return { ...((await r.json().catch(() => ({}))) as { message?: string; error?: string }), status: r.status };
  try {
    return { ...(await storeShot(await r.blob())), status: 200 };
  } catch (e) {
    return { status: 422, error: "store", message: e instanceof Error ? e.message : "The capture couldn’t be stored." };
  }
}
