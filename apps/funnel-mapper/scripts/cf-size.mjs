#!/usr/bin/env node
// After `npm run cf:build`: the compressed size Cloudflare would upload, checked against the free plan's 3 MiB Worker limit.
// Runs `wrangler deploy --dry-run` (uploads nothing, needs no account).
import { spawnSync } from "node:child_process";

const LIMIT_KIB = 3 * 1024;
const r = spawnSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", ".wrangler/dry-run"], { encoding: "utf8" });
const m = `${r.stdout}${r.stderr}`.match(/gzip:\s*([\d.]+)\s*KiB/);
if (!m) {
  console.error("Could not read the upload size. Run `npm run cf:build` first.\n" + r.stderr);
  process.exit(2);
}
const kib = Number(m[1]);
const ok = kib <= LIMIT_KIB;
console.log(`${ok ? "PASS" : "FAIL"} Cloudflare Worker size ${(kib / 1024).toFixed(2)} MiB compressed (free plan limit 3 MiB, ${Math.round(LIMIT_KIB - kib)} KiB to spare)`);
process.exit(ok ? 0 : 1);
