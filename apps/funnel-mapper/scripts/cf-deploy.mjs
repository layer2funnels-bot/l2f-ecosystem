#!/usr/bin/env node
// Builds (and, without --build-only, publishes) Funnel Mapper for Cloudflare (wrangler.production.jsonc). The NEXT_PUBLIC_* values are
// built into the pages, so the build uses the same values as the Worker's settings.
//   npm run cf:build:live   build only: Cloudflare's own build (Workers Builds, connected to GitHub) runs this, then
//                           `npx wrangler deploy --config wrangler.production.jsonc` with its own sign-in (no key in this repository)
//   npm run cf:deploy       build and publish from a machine with CLOUDFLARE_API_TOKEN set (never written to any file)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
const env = { ...process.env, ...Object.fromEntries(Object.entries(cfg.vars).filter(([k]) => k.startsWith("NEXT_PUBLIC_"))) };
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", env });
run("npx", ["opennextjs-cloudflare", "build"]);
run("node", ["scripts/cf-size.mjs"]);   // never publish a Worker over the free plan's limit
if (!process.argv.includes("--build-only")) run("npx", ["wrangler", "deploy", "--config", "wrangler.production.jsonc"]);
