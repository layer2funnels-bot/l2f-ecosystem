// Workspace isolation: the Layer2Funnels team workspace vs independent users' private workspaces.
// Requires the local Supabase stack, seeded (`npx supabase db reset`). Run: npm run test:db
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async (email: string, password = "demo-password") => {
  const c = mk();
  const { error } = await c.auth.signInWithPassword({ email, password });
  expect(error, email).toBeNull();
  return c;
};
const uid = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;

const TEAM_WS = "00000000-0000-4000-a000-000000000001";
const SAM = "10000000-0000-4000-8000-000000000001"; // team client
const TRIPWIRE = "20000000-0000-4000-8000-000000000001"; // team funnel
const INDIE = "10000000-0000-4000-8000-000000000101"; // solo's client
const INDIE_FUNNEL = "20000000-0000-4000-8000-000000000101";
const INDIE2 = "10000000-0000-4000-8000-000000000201"; // solo2's client
const TABLES = ["clients", "funnels", "funnel_versions", "funnel_actuals", "share_links", "share_comments", "products", "profiles"] as const;
const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });

let team: SupabaseClient, mate: SupabaseClient, solo: SupabaseClient, solo2: SupabaseClient, anon: SupabaseClient;
let soloWs: string, solo2Ws: string;

beforeAll(async () => {
  team = await signIn("demo@layer2funnels.test");
  mate = await signIn("teammate@layer2funnels.test");
  solo = await signIn("solo@independent.test");
  solo2 = await signIn("solo2@independent.test");
  anon = mk();
  soloWs = (await solo.from("workspaces").select("id").single()).data!.id;
  solo2Ws = (await solo2.from("workspaces").select("id").single()).data!.id;
});

describe("workspace membership", () => {
  it("each independent user has their own personal workspace; the team shares one", async () => {
    expect(soloWs).not.toBe(solo2Ws);
    expect(soloWs).not.toBe(TEAM_WS);
    const mine = await solo.from("workspaces").select("kind, agency_name");
    expect(mine.data).toEqual([{ kind: "personal", agency_name: "Solo Studio" }]);
    const t = await team.from("workspaces").select("id, kind");
    const m = await mate.from("workspaces").select("id, kind");
    expect(t.data).toEqual([{ id: TEAM_WS, kind: "team" }]);
    expect(m.data).toEqual(t.data);
  });
  it("every existing team row stays in the team workspace", async () => {
    for (const tb of TABLES) {
      const { data, error } = await team.from(tb).select("workspace_id");
      expect(error, tb).toBeNull();
      expect(new Set(data!.map((r) => r.workspace_id)), tb).toEqual(new Set(data!.length ? [TEAM_WS] : []));
    }
    expect((await mate.from("clients").select("id").eq("id", SAM)).data!.length).toBe(1);
  });
});

describe("isolation: reads", () => {
  it("Layer2Funnels users can't see independent users' data", async () => {
    for (const c of [team, mate]) {
      expect((await c.from("clients").select("id").in("id", [INDIE, INDIE2])).data).toEqual([]);
      expect((await c.from("funnels").select("id").eq("id", INDIE_FUNNEL)).data).toEqual([]);
      expect((await c.from("profiles").select("email").like("email", "%@independent.test")).data).toEqual([]);
      expect((await c.from("products").select("name").eq("name", "Indie product")).data).toEqual([]);
      expect((await c.from("workspaces").select("id").in("id", [soloWs, solo2Ws])).data).toEqual([]);
    }
  });
  it("independent users can't see Layer2Funnels data", async () => {
    expect((await solo.from("clients").select("id")).data).toEqual([{ id: INDIE }]);
    expect((await solo.from("funnels").select("id")).data).toEqual([{ id: INDIE_FUNNEL }]);
    expect((await solo.from("clients").select("id").eq("id", SAM)).data).toEqual([]);
    expect((await solo.from("funnels").select("id").eq("id", TRIPWIRE)).data).toEqual([]);
    expect((await solo.from("funnel_actuals").select("id")).data).toEqual([]);
    expect((await solo.from("share_comments").select("id").neq("funnel_id", INDIE_FUNNEL)).data).toEqual([]);
    expect((await solo.from("profiles").select("email")).data).toEqual([{ email: "solo@independent.test" }]);
    expect((await solo.from("products").select("name")).data).toEqual([{ name: "Indie product" }]);
    expect((await solo.from("workspaces").select("id").eq("id", TEAM_WS)).data).toEqual([]);
    // the legacy single-row branding table is team-only too
    expect((await solo.from("workspace").select("agency_name")).data).toEqual([]);
    // share links: only their own
    const links = await solo.from("share_links").select("token");
    expect(links.data).toEqual([{ token: "solo-share-token" }]);
  });
  it("one independent user can't see another's data", async () => {
    expect((await solo2.from("clients").select("id")).data).toEqual([{ id: INDIE2 }]);
    expect((await solo2.from("clients").select("id").eq("id", INDIE)).data).toEqual([]);
    expect((await solo2.from("funnels").select("id")).data).toEqual([]);
    expect((await solo2.from("funnel_versions").select("id")).data).toEqual([]);
    expect((await solo2.from("products").select("id")).data).toEqual([]);
    expect((await solo2.from("profiles").select("email")).data).toEqual([{ email: "solo2@independent.test" }]);
    expect((await solo.from("clients").select("id").eq("id", INDIE2)).data).toEqual([]);
  });
  it("templates: built-ins for everyone, saved templates only within their workspace", async () => {
    const t = await team.from("templates").insert({ owner_id: await uid(team), name: "Team only tpl", graph: { nodes: [], edges: [] } }).select("id").single();
    expect(t.error).toBeNull();
    const s = await solo.from("templates").insert({ owner_id: await uid(solo), name: "Solo only tpl", graph: { nodes: [], edges: [] } }).select("id, workspace_id").single();
    expect(s.error).toBeNull();
    expect(s.data!.workspace_id).toBe(soloWs);
    for (const [c, own, other] of [
      [solo, s.data!.id, t.data!.id],
      [team, t.data!.id, s.data!.id],
    ] as const) {
      expect((await c.from("templates").select("id").eq("id", own)).data!.length).toBe(1);
      expect((await c.from("templates").select("id").eq("id", other)).data).toEqual([]);
      expect((await c.from("templates").select("id").not("builtin_key", "is", null)).data!.length).toBe(5);
    }
    expect((await solo2.from("templates").select("id").in("id", [s.data!.id, t.data!.id])).data).toEqual([]);
    await team.from("templates").delete().eq("id", t.data!.id);
    await solo.from("templates").delete().eq("id", s.data!.id);
  });
});

describe("isolation: writes", () => {
  it("independent users can't change or delete Layer2Funnels rows", async () => {
    expect((await solo.from("clients").update({ notes: "pwned" }).eq("id", SAM).select()).data).toEqual([]);
    expect((await solo.from("funnels").delete().eq("id", TRIPWIRE).select()).data).toEqual([]);
    expect((await solo.from("workspaces").update({ agency_name: "pwned" }).eq("id", TEAM_WS).select()).data).toEqual([]);
    const still = await team.from("clients").select("notes").eq("id", SAM).single();
    expect(still.data!.notes).not.toBe("pwned");
    expect((await team.from("workspaces").select("agency_name").single()).data!.agency_name).toBe("Layer2Funnels");
  });
  it("nobody can attach rows to another workspace's client or funnel", async () => {
    // independent → team
    expect((await solo.from("funnels").insert({ client_id: SAM, name: "sneaky" })).error).not.toBeNull();
    expect((await solo.from("share_links").insert({ funnel_id: TRIPWIRE })).error).not.toBeNull();
    expect((await solo.from("funnel_versions").insert({ funnel_id: TRIPWIRE, graph: {}, settings: {} })).error).not.toBeNull();
    expect((await solo.from("funnel_actuals").insert({ funnel_id: TRIPWIRE, node_id: "x", period_start: "2026-01-01", period_end: "2026-01-31" })).error).not.toBeNull();
    expect((await solo.from("products").insert({ client_id: SAM, name: "sneaky" })).error).not.toBeNull();
    // team → independent, and independent → independent
    expect((await team.from("funnels").insert({ client_id: INDIE, name: "sneaky" })).error).not.toBeNull();
    expect((await solo2.from("funnels").insert({ client_id: INDIE, name: "sneaky" })).error).not.toBeNull();
    // even an explicit workspace_id is overridden by the parent, then refused
    expect((await solo.from("funnels").insert({ client_id: SAM, name: "sneaky", workspace_id: soloWs })).error).not.toBeNull();
    // moving one's own funnel under someone else's client is refused too
    expect((await solo.from("funnels").update({ client_id: SAM }).eq("id", INDIE_FUNNEL)).error).not.toBeNull();
    expect((await team.from("funnels").select("id").eq("client_id", SAM).eq("name", "sneaky")).data).toEqual([]);
  });
  it("rows can't be created in, or moved to, another workspace", async () => {
    expect((await solo.from("clients").insert({ name: "x", workspace_id: TEAM_WS })).error).not.toBeNull();
    expect((await solo.from("clients").update({ workspace_id: TEAM_WS }).eq("id", INDIE)).error).not.toBeNull();
    expect((await team.from("clients").insert({ name: "x", workspace_id: soloWs })).error).not.toBeNull();
    const me = await uid(solo);
    expect((await solo.from("profiles").update({ workspace_id: TEAM_WS }).eq("id", me)).error).not.toBeNull();
    // a team admin can't pull an independent user into the team or deactivate them
    expect((await team.from("profiles").update({ active: false }).eq("id", me).select()).data).toEqual([]);
  });
  it("independent users create, edit and delete freely inside their own workspace", async () => {
    const c = await solo.from("clients").insert({ name: `Solo new ${Date.now()}` }).select("id, workspace_id").single();
    expect(c.error).toBeNull();
    expect(c.data!.workspace_id).toBe(soloWs);
    const f = await solo.from("funnels").insert({ client_id: c.data!.id, name: "Mine" }).select("workspace_id").single();
    expect(f.error).toBeNull();
    expect(f.data!.workspace_id).toBe(soloWs);
    const w = await solo.from("workspaces").update({ agency_name: "Solo Studio" }).eq("id", soloWs).select("agency_name").single();
    expect(w.error).toBeNull();
    // and the team never sees it
    expect((await team.from("clients").select("id").eq("id", c.data!.id)).data).toEqual([]);
    expect((await solo.from("clients").delete().eq("id", c.data!.id).select()).data!.length).toBe(1);
  });
  it("the pending sign-up table is server-only", async () => {
    expect((await solo.from("workspace_signups").insert({ email: "victim@example.test" })).error).not.toBeNull();
    expect((await anon.from("workspace_signups").insert({ email: "victim@example.test" })).error).not.toBeNull();
    expect((await team.from("workspace_signups").select("email")).data ?? []).toEqual([]);
  });
});

describe("isolation: storage", () => {
  it("files are private to their workspace", async () => {
    const teamPath = `${await uid(team)}/iso-${Date.now()}.png`;
    expect((await team.storage.from("screenshots").upload(teamPath, png(), { contentType: "image/png" })).error).toBeNull();
    expect((await mate.storage.from("screenshots").createSignedUrl(teamPath, 60)).error).toBeNull();
    expect((await solo.storage.from("screenshots").createSignedUrl(teamPath, 60)).error).not.toBeNull();
    expect((await solo.storage.from("screenshots").download(teamPath)).error).not.toBeNull();
    // can't write into someone else's folder
    expect((await solo.storage.from("screenshots").upload(`${await uid(team)}/evil.png`, png(), { contentType: "image/png" })).error).not.toBeNull();
    // their own folder works, and stays theirs
    const soloPath = `${await uid(solo)}/iso-${Date.now()}.png`;
    expect((await solo.storage.from("screenshots").upload(soloPath, png(), { contentType: "image/png" })).error).toBeNull();
    expect((await team.storage.from("screenshots").createSignedUrl(soloPath, 60)).error).not.toBeNull();
    expect((await solo2.storage.from("screenshots").createSignedUrl(soloPath, 60)).error).not.toBeNull();
    // thumbnails follow the funnel
    expect((await solo.storage.from("thumbnails").upload(`${TRIPWIRE}.png`, png(), { contentType: "image/png", upsert: true })).error).not.toBeNull();
    expect((await solo.storage.from("thumbnails").upload(`${INDIE_FUNNEL}.png`, png(), { contentType: "image/png", upsert: true })).error).toBeNull();
    expect((await team.storage.from("thumbnails").createSignedUrl(`${INDIE_FUNNEL}.png`, 60)).error).not.toBeNull();
    // and nobody outside can delete them
    expect((await solo.storage.from("screenshots").remove([teamPath])).data ?? []).toEqual([]);
    expect((await team.storage.from("screenshots").createSignedUrl(teamPath, 60)).error).toBeNull();
    await team.storage.from("screenshots").remove([teamPath]);
    await solo.storage.from("screenshots").remove([soloPath]);
    await solo.storage.from("thumbnails").remove([`${INDIE_FUNNEL}.png`]);
  });
});

describe("share links across workspaces", () => {
  it("an independent user's link is branded with their workspace, and comments reach only them", async () => {
    const { data, error } = await anon.rpc("get_shared_funnel", { p_token: "solo-share-token" });
    expect(error).toBeNull();
    expect(data.funnel.name).toBe("Indie quiz funnel");
    expect(data.agency.name).toBe("Solo Studio");
    const team = (await anon.rpc("get_shared_funnel", { p_token: "demo-share-token" })).data;
    expect(team.agency.name).toBe("Layer2Funnels");
    const body = `Indie comment ${Date.now()}`;
    expect((await anon.rpc("add_share_comment", { p_token: "solo-share-token", p_node_id: "", p_author: "Client", p_body: body })).error).toBeNull();
    expect((await solo.from("share_comments").select("body").eq("body", body)).data!.length).toBe(1);
    expect((await mate.from("share_comments").select("body").eq("body", body)).data).toEqual([]);
    expect((await solo2.from("share_comments").select("body").eq("body", body)).data).toEqual([]);
  });
});

describe("accounts", () => {
  it("an independent sign-up gets a fresh private workspace, as its owner", async () => {
    if (!SERVICE) return; // needs the local service key in .env.local
    const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `indie-${Date.now()}@example.test`;
    expect((await svc.from("workspace_signups").insert({ email, full_name: "New Indie", workspace_name: "New Indie Co" })).error).toBeNull();
    const inv = await svc.auth.admin.inviteUserByEmail(email);
    expect(inv.error).toBeNull();
    const id = inv.data.user!.id;
    const prof = await svc.from("profiles").select("role, active, workspace:workspaces!profiles_workspace_id_fkey(kind, agency_name)").eq("id", id).single();
    expect(prof.data).toEqual({ role: "admin", active: true, workspace: { kind: "personal", agency_name: "New Indie Co" } });
    // the server removes the pending row after the invite (lib/independent.ts); do the same here
    await svc.from("workspace_signups").delete().eq("email", email);
    await svc.auth.admin.updateUserById(id, { password: "indie-password-1", email_confirm: true });
    const u = await signIn(email, "indie-password-1");
    expect((await u.from("clients").select("id")).data).toEqual([]);
    expect((await u.from("profiles").select("email")).data).toEqual([{ email }]);
    // the team can't see the new account
    expect((await team.from("profiles").select("id").eq("id", id)).data).toEqual([]);
    const ws = (await u.from("workspaces").select("id").single()).data!.id;
    await svc.auth.admin.deleteUser(id);
    await svc.from("workspaces").delete().eq("id", ws);
  });
  it("a team invite (no pending sign-up) joins the team workspace", async () => {
    if (!SERVICE) return;
    const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `teaminv-${Date.now()}@example.test`;
    const inv = await svc.auth.admin.inviteUserByEmail(email);
    expect(inv.error).toBeNull();
    const prof = await team.from("workspace_members").select("role, active, workspace_id").eq("user_id", inv.data.user!.id).single();
    expect(prof.data).toEqual({ role: "editor", active: true, workspace_id: TEAM_WS });
    await svc.auth.admin.deleteUser(inv.data.user!.id);
  });
});

describe("multiple workspaces", () => {
  it("admins create workspaces with their own data and members; nobody switches in without access", async () => {
    if (!SERVICE) return;
    const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    // only admins create workspaces
    expect((await mate.rpc("create_workspace", { p_name: "Not allowed" })).error).not.toBeNull();
    // solo (admin of their own workspace) creates one and is switched into it: empty, theirs alone
    const created = await solo.rpc("create_workspace", { p_name: "Solo Agency Two" });
    expect(created.error).toBeNull();
    const ws = created.data as string;
    try {
      expect((await solo.from("workspaces").select("id").eq("id", ws)).data).toEqual([{ id: ws }]);
      expect((await solo.from("clients").select("id")).data).toEqual([]);
      const c = await solo.from("clients").insert({ name: "Agency Two client" }).select("id, workspace_id").single();
      expect(c.data!.workspace_id).toBe(ws);
      // nobody else can see it or switch into it
      for (const other of [team, mate, solo2]) {
        expect((await other.from("workspaces").select("id").eq("id", ws)).data).toEqual([]);
        expect((await other.from("clients").select("id").eq("id", c.data!.id)).data).toEqual([]);
        expect((await other.rpc("switch_workspace", { p_workspace: ws })).error).not.toBeNull();
      }
      // a profile can't be pointed at it directly either
      expect((await solo2.from("profiles").update({ workspace_id: ws }).eq("id", await uid(solo2))).error).not.toBeNull();
      // give solo2 access: now they can switch in and see this workspace's data, and only it
      expect((await svc.from("workspace_members").insert({ workspace_id: ws, user_id: await uid(solo2), role: "editor" })).error).toBeNull();
      expect((await solo2.rpc("switch_workspace", { p_workspace: ws })).error).toBeNull();
      expect((await solo2.from("clients").select("id")).data).toEqual([{ id: c.data!.id }]);
      expect(((await solo2.from("profiles").select("email")).data ?? []).map((p) => p.email).sort()).toEqual(["solo2@independent.test", "solo@independent.test"]);
      // members can't manage members; the admin can deactivate them, which cuts access at once
      expect((await solo2.from("workspace_members").update({ role: "admin" }).eq("workspace_id", ws).eq("user_id", await uid(solo2)).select()).data).toEqual([]);
      expect((await solo.from("workspace_members").update({ active: false }).eq("workspace_id", ws).eq("user_id", await uid(solo2))).error).toBeNull();
      expect((await solo2.from("clients").select("id")).data).toEqual([]);
      expect((await solo2.rpc("switch_workspace", { p_workspace: ws })).error).not.toBeNull();
      // the last admin can't step down
      expect((await solo.from("workspace_members").update({ role: "editor" }).eq("workspace_id", ws).eq("user_id", await uid(solo))).error).not.toBeNull();
      // back to their own workspaces: each sees its own data again
      expect((await solo2.rpc("switch_workspace", { p_workspace: solo2Ws })).error).toBeNull();
      expect((await solo2.from("clients").select("id")).data).toEqual([{ id: INDIE2 }]);
      expect((await solo.rpc("switch_workspace", { p_workspace: soloWs })).error).toBeNull();
      expect((await solo.from("clients").select("id")).data).toEqual([{ id: INDIE }]);
      // the team never saw any of it
      expect((await team.from("clients").select("id").eq("id", c.data!.id)).data).toEqual([]);
    } finally {
      await svc.from("profiles").update({ workspace_id: soloWs }).eq("id", await uid(solo));
      await svc.from("profiles").update({ workspace_id: solo2Ws }).eq("id", await uid(solo2));
      await svc.from("clients").delete().eq("workspace_id", ws);
      await svc.from("workspaces").delete().eq("id", ws);
    }
  });
});
