#!/usr/bin/env node
// One-command production deployment: Supabase (project, migrations, auth) + Vercel (project, env vars, deploy).
// Safe to re-run: every step checks what already exists. Never prints secrets.
//
// Required environment variables:
//   SUPABASE_ACCESS_TOKEN  Supabase personal access token (supabase.com/dashboard/account/tokens)
//   VERCEL_TOKEN           Vercel access token (vercel.com/account/settings/tokens)
//   ADMIN_EMAIL            email of the first workspace admin (gets an invite on the first run)
// Optional:
//   SUPABASE_ORG           organization slug (default: your only organization, or a new "Layer2Funnels" one)
//   SUPABASE_REGION        default eu-west-2 (London)
//   PROJECT_NAME           default funnel-mapper-pro (used for both Supabase and Vercel)
//   VERCEL_SCOPE           Vercel team slug (default: your default team / personal account)
//   SKIP_DEPLOY=1          only do the Supabase part
//   RESEND_ADMIN_INVITE=1  send the admin invite again (e.g. it expired)
//
// Usage: npm run deploy     (sets NODE_USE_ENV_PROXY=1 so Node's fetch honours HTTPS_PROXY where one is set)
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { HISTORY_DDL, listMigrations, pendingMigrations, wrapMigration } from "./migrations.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const STATE_FILE = `${ROOT}.deploy/state.json`;
const VERCEL_CLI = "vercel@62.1.0";
const env = (k, d) => process.env[k] ?? d;
const need = (k) => {
  const v = process.env[k];
  if (!v) fail(`Missing ${k}. See docs/deployment.md.`);
  return v;
};
function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
const step = (t) => console.log(`\n▶ ${t}`);
const ok = (t) => console.log(`  ✓ ${t}`);
const info = (t) => console.log(`  · ${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
const save = () => {
  mkdirSync(`${ROOT}.deploy`, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
};

/* ---------------- HTTP helpers ---------------- */
async function api(base, token, method, path, body, { allow404 = false, query } = {}) {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(query ?? {})) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (allow404 && r.status === 404) return null;
    const text = await r.text();
    if (r.ok) return text ? JSON.parse(text) : null;
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(`${method} ${url.pathname} → ${r.status}: ${text.slice(0, 500)}`);
  }
}
const sb = (method, path, body, opts) => api("https://api.supabase.com", need("SUPABASE_ACCESS_TOKEN"), method, path, body, opts);
const vc = (method, path, body, opts = {}) => api("https://api.vercel.com", need("VERCEL_TOKEN"), method, path, body, { ...opts, query: { teamId: state.vercelTeamId, ...(opts.query ?? {}) } });

/* ---------------- Supabase ---------------- */
async function supabaseOrg() {
  step("Supabase organization");
  const orgs = await sb("GET", "/v1/organizations");
  const want = env("SUPABASE_ORG");
  let org = want ? orgs.find((o) => o.slug === want || o.name === want) : orgs.length === 1 ? orgs[0] : null;
  if (!org && !want && orgs.length > 1) fail(`You have ${orgs.length} Supabase organizations (${orgs.map((o) => o.slug).join(", ")}). Set SUPABASE_ORG to one of them.`);
  if (!org && want) fail(`Supabase organization "${want}" not found.`);
  if (!org) {
    org = await sb("POST", "/v1/organizations", { name: "Layer2Funnels" });
    ok(`created organization ${org.name}`);
  } else ok(`using organization ${org.name} (${org.slug})`);
  state.supabaseOrg = org.slug;
  save();
  return org;
}

async function supabaseProject(org) {
  step("Supabase project");
  const name = env("PROJECT_NAME", "funnel-mapper-pro");
  const projects = await sb("GET", "/v1/projects");
  let p = projects.find((x) => x.ref === state.supabaseRef) ?? projects.find((x) => x.name === name && (x.organization_slug === org.slug || x.organization_id === org.id));
  if (!p) {
    const region = env("SUPABASE_REGION", "eu-west-2");
    info(`creating "${name}" in ${region} (takes 1–3 minutes)…`);
    p = await sb("POST", "/v1/projects", { name, organization_slug: org.slug, db_pass: randomBytes(24).toString("base64url"), region_selection: { type: "specific", code: region } });
    ok(`created project ${p.ref}`);
  } else ok(`using project ${p.name} (${p.ref})`);
  state.supabaseRef = p.ref;
  state.supabaseUrl = `https://${p.ref}.supabase.co`;
  save();
  for (let i = 0; i < 90; i++) {
    const cur = await sb("GET", `/v1/projects/${p.ref}`);
    if (cur.status === "ACTIVE_HEALTHY") break;
    if (["INACTIVE", "PAUSING"].includes(cur.status)) {
      info("project is paused, restoring…");
      await sb("POST", `/v1/projects/${p.ref}/restore`, {});
    }
    if (i === 89) fail(`project status is still ${cur.status}`);
    if (i % 3 === 0) info(`waiting for project (status ${cur.status})…`);
    await sleep(10_000);
  }
  // the database answers a little after the project reports healthy
  for (let i = 0; i < 30; i++) {
    try {
      await sql("select 1");
      break;
    } catch (e) {
      if (i === 29) throw e;
      await sleep(5000);
    }
  }
  ok("database is ready");
}

const sql = (query) => sb("POST", `/v1/projects/${state.supabaseRef}/database/query`, { query });

async function supabaseMigrations() {
  step("Database migrations");
  await sql(HISTORY_DDL);
  const history = await sql("select version, name from supabase_migrations.schema_migrations");
  let pending;
  try {
    // MIGRATIONS_BASELINE: the last repo migration already in a database migrated by hand (see docs/deployment.md)
    pending = pendingMigrations(listMigrations(ROOT), history, process.env.MIGRATIONS_BASELINE || undefined);
  } catch (e) {
    fail(e.message);
  }
  let n = 0;
  for (const m of pending) {
    await sql(wrapMigration(m));
    ok(`applied ${m.file}`);
    n++;
  }
  if (!n) ok("already up to date");
}

async function supabaseKeys() {
  step("Supabase API keys");
  const keys = await sb("GET", `/v1/projects/${state.supabaseRef}/api-keys`, null, { query: { reveal: "true" } });
  const pick = (type, legacyName) => keys.find((k) => k.type === type && k.api_key)?.api_key ?? keys.find((k) => k.name === legacyName && k.api_key)?.api_key;
  const publicKey = pick("publishable", "anon");
  const serverKey = pick("secret", "service_role");
  if (!publicKey || !serverKey) fail("couldn't read the project's API keys");
  ok(`public key: ${publicKey.startsWith("sb_publishable_") ? "publishable" : "legacy anon"} · server key: ${serverKey.startsWith("sb_secret_") ? "secret" : "legacy service_role"}`);
  return { publicKey, serverKey };
}

function templates() {
  const t = (f) => readFileSync(`${ROOT}supabase/templates/${f}.html`, "utf8");
  return {
    mailer_subjects_invite: "You’re invited to Funnel Mapper Pro V2",
    mailer_templates_invite_content: t("invite"),
    mailer_subjects_magic_link: "Your Funnel Mapper Pro V2 sign-in link",
    mailer_templates_magic_link_content: t("magic_link"),
    mailer_subjects_recovery: "Reset your Funnel Mapper Pro V2 password",
    mailer_templates_recovery_content: t("recovery"),
  };
}

async function supabaseAuth(siteUrl) {
  step("Supabase Auth settings");
  await sb("PATCH", `/v1/projects/${state.supabaseRef}/config/auth`, {
    site_url: siteUrl,
    uri_allow_list: `${siteUrl}/**`,
    disable_signup: true, // private team tool: invite only
    external_email_enabled: true, // email + password / magic links for team members
    mailer_autoconfirm: false,
    password_min_length: 8,
    ...templates(),
  });
  const cfg = await sb("GET", `/v1/projects/${state.supabaseRef}/config/auth`);
  if (cfg.disable_signup !== true) fail("sign-ups are still enabled");
  if (cfg.site_url !== siteUrl) fail(`site URL is ${cfg.site_url}`);
  ok(`public sign-up OFF · site URL ${siteUrl} · invite / magic link / reset emails point to /auth/confirm`);
}

async function inviteAdmin(serverKey) {
  step("First admin");
  const svc = createClient(state.supabaseUrl, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: admins, error } = await svc.from("profiles").select("email").eq("role", "admin").eq("active", true);
  if (error) throw error;
  if (admins.length && !env("RESEND_ADMIN_INVITE")) {
    ok(`workspace already has an admin (${admins.map((a) => a.email).join(", ")})`);
    return;
  }
  const email = need("ADMIN_EMAIL").trim().toLowerCase();
  const inv = await svc.auth.admin.inviteUserByEmail(email, { redirectTo: `${state.siteUrl}/auth/callback?next=/update-password` });
  if (inv.error) fail(`couldn't invite ${email}: ${inv.error.message}`);
  const { data: me } = await svc.from("profiles").select("role, active").eq("email", email).single();
  if (me?.role !== "admin" || !me.active) fail(`${email} wasn't made the admin (got ${JSON.stringify(me)})`);
  ok(`invite sent to ${email}. They become the workspace admin when they accept and choose a password`);
  state.adminEmail = email;
  save();
}

/* ---------------- Vercel ---------------- */
async function vercelProject() {
  step("Vercel project");
  const { user } = await vc("GET", "/v2/user");
  const scope = env("VERCEL_SCOPE");
  if (scope) {
    const { teams } = await vc("GET", "/v2/teams", null, { query: { teamId: undefined } });
    const team = teams.find((t) => t.slug === scope || t.id === scope);
    if (!team) fail(`Vercel team "${scope}" not found`);
    state.vercelTeamId = team.id;
  } else state.vercelTeamId = user.defaultTeamId ?? undefined;
  save();
  const name = env("PROJECT_NAME", "funnel-mapper-pro");
  let p = await vc("GET", `/v9/projects/${encodeURIComponent(name)}`, null, { allow404: true });
  if (!p) {
    p = await vc("POST", "/v11/projects", { name, framework: "nextjs" });
    ok(`created Vercel project ${p.name}`);
  } else ok(`using Vercel project ${p.name}`);
  state.vercelProjectId = p.id;
  state.vercelOrgId = p.accountId;
  save();
  mkdirSync(`${ROOT}.vercel`, { recursive: true });
  writeFileSync(`${ROOT}.vercel/project.json`, JSON.stringify({ orgId: p.accountId, projectId: p.id }));
  return p;
}

async function vercelEnv(vars) {
  step("Vercel environment variables");
  for (const [key, { value, sensitive }] of Object.entries(vars)) {
    const put = (type) => vc("POST", `/v10/projects/${state.vercelProjectId}/env`, { key, value, type, target: ["production", "preview"] }, { query: { upsert: "true" } });
    if (sensitive) await put("sensitive").catch(() => put("encrypted"));
    else await put("encrypted");
    ok(`${key}${sensitive ? " (sensitive, server-only)" : ""}`);
  }
}

async function vercelDeploy() {
  step("Vercel production deployment (build takes ~2–4 minutes)");
  const args = ["--yes", VERCEL_CLI, "deploy", "--prod", "--yes", `--token=${need("VERCEL_TOKEN")}`];
  const r = spawnSync("npx", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1" } });
  const out = `${r.stdout ?? ""}`.trim();
  const url = out.split(/\s+/).reverse().find((s) => /^https:\/\/\S+\.vercel\.app$/.test(s));
  if (r.status !== 0 || !url) {
    console.error((r.stderr ?? "").split("\n").slice(-40).join("\n").replaceAll(need("VERCEL_TOKEN"), "***"));
    fail("Vercel deployment failed (build log above)");
  }
  const d = await vc("GET", `/v13/deployments/${new URL(url).host}`);
  if (d.readyState !== "READY") fail(`deployment state ${d.readyState}`);
  ok(`deployment ready: ${url}`);
  // the stable production address (project.vercel.app style)
  const { domains } = await vc("GET", `/v9/projects/${state.vercelProjectId}/domains`);
  const prod = (domains ?? []).filter((x) => x.verified !== false).map((x) => x.name).sort((a, b) => Number(b.endsWith(".vercel.app")) - Number(a.endsWith(".vercel.app")) || a.length - b.length)[0];
  state.siteUrl = prod ? `https://${prod}` : url;
  save();
  ok(`production URL: ${state.siteUrl}`);
}

async function smoke(siteUrl) {
  step("Smoke test of the live site");
  const get = (p) => fetch(`${siteUrl}${p}`, { redirect: "manual" });
  const login = await get("/login");
  if (login.status !== 200) fail(`/login returned ${login.status}`);
  if (login.headers.get("x-robots-tag") !== "noindex, nofollow") fail("security headers missing");
  const home = await get("/clients");
  if (home.status < 300 || home.status > 399 || !home.headers.get("location")?.includes("/login")) fail(`/clients didn't redirect to sign-in (${home.status})`);
  const share = await get("/s/not-a-real-token-123");
  if (share.status !== 200 || !(await share.text()).includes("isn’t available")) fail("share page check failed");
  ok("sign-in page up, private pages redirect to sign-in, share links checked, security headers present");
}

/* ---------------- run ---------------- */
const org = await supabaseOrg();
await supabaseProject(org);
await supabaseMigrations();
const { publicKey, serverKey } = await supabaseKeys();
if (!env("SKIP_DEPLOY")) {
  await vercelProject();
  await vercelEnv({
    NEXT_PUBLIC_SUPABASE_URL: { value: state.supabaseUrl },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: { value: publicKey },
    SUPABASE_SERVICE_ROLE_KEY: { value: serverKey, sensitive: true },
  });
  await vercelDeploy();
  // second pass bakes the final address into the build (invite redirects, emails)
  if (state.siteUrlBaked !== state.siteUrl) {
    await vercelEnv({ NEXT_PUBLIC_SITE_URL: { value: state.siteUrl } });
    await vercelDeploy();
    state.siteUrlBaked = state.siteUrl;
    save();
  }
  await supabaseAuth(state.siteUrl);
  await smoke(state.siteUrl);
  await inviteAdmin(serverKey);
}
console.log(`\n✔ Done.\n  App: ${state.siteUrl ?? "(not deployed)"}\n  Supabase project: ${state.supabaseRef}\n  State saved in .deploy/state.json (no secrets).`);
