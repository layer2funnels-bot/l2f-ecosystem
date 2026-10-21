#!/usr/bin/env node
// Verifies a deployed Funnel Mapper Pro end to end, then removes everything it created.
//
// It creates three temporary accounts directly through the Auth admin API (no emails are sent):
//   A: active member (drives the browser walkthrough), B: active member (team access), C: never invited (no access).
// API checks: shared workspace, uninvited/anonymous isolation, sign-up blocked, private storage, share-link privacy.
// Browser walkthrough (tests/live/live.spec.ts): sign in, dashboard, client, funnel editing, autosave, versions,
// template, exports, import, share links (view + hidden numbers), comments, privacy redirects.
// Cleanup: deletes the temporary accounts (their clients, funnels, versions, templates, links and comments go
// with them) and their storage files.
//
// Configuration, either:
//   - after `npm run deploy`: SUPABASE_ACCESS_TOKEN (+ .deploy/state.json written by deploy), or
//   - explicitly: LIVE_SITE_URL, LIVE_SUPABASE_URL, LIVE_ANON_KEY, LIVE_SERVICE_KEY (e.g. a local stack).
// Usage: npm run live-check
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ROOT = new URL("../../", import.meta.url).pathname;
const fail = (m) => {
  throw new Error(m);
};
const ok = (t) => console.log(`  ✓ ${t}`);
const step = (t) => console.log(`\n▶ ${t}`);

async function config() {
  if (process.env.LIVE_SITE_URL) {
    return { site: process.env.LIVE_SITE_URL, url: process.env.LIVE_SUPABASE_URL, anon: process.env.LIVE_ANON_KEY, service: process.env.LIVE_SERVICE_KEY };
  }
  const state = existsSync(`${ROOT}.deploy/state.json`) ? JSON.parse(readFileSync(`${ROOT}.deploy/state.json`, "utf8")) : null;
  if (!state?.supabaseRef || !state.siteUrl) fail("Run `npm run deploy` first (or set LIVE_* variables).");
  const r = await fetch(`https://api.supabase.com/v1/projects/${state.supabaseRef}/api-keys?reveal=true`, { headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  if (!r.ok) fail(`couldn't read API keys (${r.status})`);
  const keys = await r.json();
  const pick = (type, legacy) => keys.find((k) => k.type === type && k.api_key)?.api_key ?? keys.find((k) => k.name === legacy)?.api_key;
  return { site: state.siteUrl, url: state.supabaseUrl, anon: pick("publishable", "anon"), service: pick("secret", "service_role") };
}

const cfg = await config();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(cfg.url, cfg.service, opts);
const anonClient = () => createClient(cfg.url, cfg.anon, opts);
const stamp = `${Date.now()}`;
const pass = () => randomBytes(18).toString("base64url");
const made = [];
const uploaded = [];
let failed = false;

async function tempUser(label, activate) {
  const email = `livecheck-${label}-${stamp}@example.com`;
  const password = pass();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Live check ${label}` } });
  if (error) fail(`create ${label}: ${error.message}`);
  made.push(data.user.id);
  if (activate) {
    const { error: e } = await svc.from("profiles").update({ active: true, role: "member" }).eq("id", data.user.id);
    if (e) fail(`activate ${label}: ${e.message}`);
  }
  const c = anonClient();
  const { error: se } = await c.auth.signInWithPassword({ email, password });
  if (se) fail(`sign in ${label}: ${se.message}`);
  return { id: data.user.id, email, password, c };
}

try {
  step("Pre-checks");
  const { data: admins } = await svc.from("profiles").select("id").eq("role", "admin").eq("active", true);
  if (!admins?.length) fail("The workspace has no active admin yet. Accept the admin invite first (temporary accounts must never become the first admin).");
  ok("workspace has an admin");

  step("Temporary accounts (no emails sent)");
  const A = await tempUser("a", true);
  const B = await tempUser("b", true);
  const C = await tempUser("c", false);
  ok("A and B active members, C not invited");

  step("Access rules");
  const signup = await anonClient().auth.signUp({ email: `livecheck-signup-${stamp}@example.com`, password: pass() });
  if (!signup.error) fail("public sign-up is OPEN");
  ok("public sign-up is blocked");
  const { data: client, error: ce } = await A.c.from("clients").insert({ name: `Live check client ${stamp}` }).select("id").single();
  if (ce) fail(`A can't create a client: ${ce.message}`);
  const seenByB = await B.c.from("clients").select("id").eq("id", client.id);
  if (seenByB.data?.length !== 1) fail("teammate B can't see A's client (shared workspace broken)");
  ok("teammates share the workspace");
  if ((await C.c.from("clients").select("id")).data?.length) fail("uninvited account C can see clients");
  if ((await anonClient().from("clients").select("id")).data?.length) fail("anonymous visitors can see clients");
  ok("uninvited accounts and anonymous visitors see nothing");
  const cProfile = await C.c.from("profiles").update({ active: true }).eq("id", C.id).select();
  if (cProfile.data?.length) fail("an uninvited account activated itself");
  const aRole = await A.c.from("profiles").update({ role: "admin" }).eq("id", A.id);
  if (!aRole.error) fail("a member promoted themselves to admin");
  ok("members can't activate or promote themselves");

  step("Private storage");
  const path = `livecheck/${stamp}.png`;
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
  const up = await A.c.storage.from("screenshots").upload(path, png, { contentType: "image/png" });
  if (up.error) fail(`upload: ${up.error.message}`);
  uploaded.push(["screenshots", path]);
  if ((await fetch(`${cfg.url}/storage/v1/object/public/screenshots/${path}`)).ok) fail("screenshots are publicly readable");
  if (!(await B.c.storage.from("screenshots").createSignedUrl(path, 60)).data?.signedUrl) fail("teammate can't open a screenshot");
  if (!(await anonClient().storage.from("screenshots").download(path)).error) fail("anonymous download of a screenshot worked");
  if (!(await C.c.storage.from("screenshots").download(path)).error) fail("uninvited account downloaded a screenshot");
  ok("screenshots/thumbnails are private to the team");

  step("Share-link privacy");
  const graph = { nodes: [{ id: "n1", type: "checkout", name: "Checkout", x: 0, y: 0, desc: "INTERNAL NOTE live", shot: path, p: { price: 4321, cr: 10, newc: true } }], edges: [], view: { x: 60, y: 40, k: 1 } };
  const { data: funnel, error: fe } = await A.c.from("funnels").insert({ client_id: client.id, name: "Live check funnel", graph }).select("id").single();
  if (fe) fail(`funnel insert: ${fe.message}`);
  const { data: link } = await A.c.from("share_links").insert({ funnel_id: funnel.id }).select("token").single();
  const shared = await anonClient().rpc("get_shared_funnel", { p_token: link.token });
  const txt = JSON.stringify(shared.data);
  if (!txt.includes("Live check funnel")) fail("share link didn't return the funnel");
  if (txt.includes("INTERNAL NOTE") || txt.includes(path)) fail("share link leaked internal notes or screenshots");
  const { data: hidden } = await A.c.from("share_links").insert({ funnel_id: funnel.id, hide_numbers: true }).select("token").single();
  const h = JSON.stringify((await anonClient().rpc("get_shared_funnel", { p_token: hidden.token })).data);
  if (h.includes("4321")) fail("hidden-number link leaked a price");
  ok("share links never include internal notes or screenshots; hidden numbers stay hidden");

  step("Browser walkthrough on the live site");
  const r = spawnSync("npx", ["playwright", "test", "-c", "playwright.live.config.ts"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, LIVE_SITE_URL: cfg.site, LIVE_EMAIL: A.email, LIVE_PASSWORD: A.password, LIVE_STAMP: stamp },
  });
  if (r.status !== 0) fail("browser walkthrough failed (see above)");
  ok("browser walkthrough passed");
} catch (e) {
  failed = true;
  console.error(`\n✖ ${e.message}`);
} finally {
  step("Cleanup");
  try {
    if (made.length) {
      const { data: fs } = await svc.from("funnels").select("id").in("owner_id", made);
      const thumbs = (fs ?? []).map((f) => `${f.id}.png`);
      if (thumbs.length) await svc.storage.from("thumbnails").remove(thumbs);
      const { data: shots } = await svc.storage.from("screenshots").list("livecheck");
      const mine = (shots ?? []).filter((o) => o.name.startsWith(stamp)).map((o) => `livecheck/${o.name}`);
      for (const [b, p] of uploaded) if (!mine.includes(p) && b === "screenshots") mine.push(p);
      if (mine.length) await svc.storage.from("screenshots").remove(mine);
    }
    for (const id of made) await svc.auth.admin.deleteUser(id);
    const left = made.length ? (await svc.from("clients").select("id").in("owner_id", made)).data ?? [] : [];
    const leftTpl = made.length ? (await svc.from("templates").select("id").in("owner_id", made)).data ?? [] : [];
    if (left.length || leftTpl.length) console.error(`  ! leftovers: ${left.length} clients, ${leftTpl.length} templates`);
    else ok(`removed ${made.length} temporary accounts and everything they created`);
  } catch (e) {
    console.error(`  ! cleanup problem: ${e.message}`);
    failed = true;
  }
}
console.log(failed ? "\n✖ Live check FAILED" : `\n✔ Live check passed for ${cfg.site}`);
process.exit(failed ? 1 : 0);
