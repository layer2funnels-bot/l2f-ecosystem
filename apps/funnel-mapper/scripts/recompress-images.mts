// One-off job (V2 F7): re-compress stored images that are 100 KB or larger, in place (same path, so every reference
// keeps working), as WebP through the same pipeline as uploads. Dry run by default; pass --apply to write.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (never printed, never committed).
//   npx tsx scripts/recompress-images.mts            # list what would change
//   npx tsx scripts/recompress-images.mts --apply    # re-compress
import { createClient } from "@supabase/supabase-js";
import { ImageRejected, MAX_STORED_BYTES, optimiseImage, sizeLine, type ImageKind } from "../lib/image-optimise";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const sb = createClient(url, key, { auth: { persistSession: false } });
const BUCKETS: [string, ImageKind][] = [
  ["screenshots", "shot"],
  ["logos", "logo"],
  ["thumbnails", "shot"],
];

async function walk(bucket: string, prefix = ""): Promise<{ name: string; size: number }[]> {
  const out: { name: string; size: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const f of data ?? []) {
      const path = prefix ? `${prefix}/${f.name}` : f.name;
      if (!f.id) out.push(...(await walk(bucket, path))); // a folder
      else out.push({ name: path, size: Number(f.metadata?.size ?? 0) });
    }
    if (!data || data.length < 1000) return out;
  }
}

let changed = 0,
  failed = 0;
for (const [bucket, kind] of BUCKETS) {
  const files = (await walk(bucket)).filter((f) => f.size >= MAX_STORED_BYTES);
  console.log(`${bucket}: ${files.length} image(s) at or over 100 KB`);
  for (const f of files) {
    const { data, error } = await sb.storage.from(bucket).download(f.name);
    if (error || !data) {
      failed++;
      console.log(`  ✗ ${f.name}: couldn’t download`);
      continue;
    }
    try {
      const out = await optimiseImage(Buffer.from(await data.arrayBuffer()), kind);
      console.log(`  ${apply ? "✓" : "·"} ${f.name}: ${sizeLine(f.size, out.bytes.byteLength)}`);
      if (apply) {
        const { error: up } = await sb.storage.from(bucket).upload(f.name, out.bytes, { upsert: true, contentType: out.type, cacheControl: "3600" });
        if (up) throw up;
      }
      changed++;
    } catch (e) {
      failed++;
      console.log(`  ✗ ${f.name}: ${e instanceof ImageRejected ? e.message : "couldn’t be processed"}`);
    }
  }
}
console.log(`${apply ? "Re-compressed" : "Would re-compress"} ${changed}; ${failed} need attention.`);
