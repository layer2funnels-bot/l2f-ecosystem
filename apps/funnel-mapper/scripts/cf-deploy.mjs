#!/usr/bin/env node
// Publishes Funnel Mapper to Cloudflare (wrangler.production.jsonc). The NEXT_PUBLIC_* values are built into the pages, so the build
// uses the same values as the Worker's settings. Needs a Cloudflare API token in CLOUDFLARE_API_TOKEN (never written to any file).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
const env = { ...process.env, ...Object.fromEntries(Object.entries(cfg.vars).filter(([k]) => k.startsWith("NEXT_PUBLIC_"))) };
const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", env });
run("npx", ["opennextjs-cloudflare", "build"]);
run("node", ["scripts/cf-size.mjs"]);   // never publish a Worker over the free plan's limit
run("npx", ["wrangler", "deploy", "--config", "wrangler.production.jsonc"]);
