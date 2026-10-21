// Owner / Admin / Editor / Viewer per workspace membership (supabase/migrations/20261011000000_roles.sql) against the local Supabase stack.
// Requires `npx supabase start` and `npx supabase db reset` (seed). Run: npm run test:db
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async (email: string) => {
  const c = mk();
  const { error } = await c.auth.signInWithPassword({ email, password: "demo-password" });
  expect(error, email).toBeNull();
  return c;
};
const idOf = async (c: SupabaseClient) => (await c.auth.getUser()).data.user!.id;

const SAM = "10000000-0000-4000-8000-000000000001";
const TRIPWIRE = "20000000-0000-4000-8000-000000000001";
let owner: SupabaseClient, editor: SupabaseClient, viewer: SupabaseClient;
let ownerId: string, editorId: string, viewerId: string;

beforeAll(async () => {
  owner = await signIn("demo@layer2funnels.test");
  editor = await signIn("teammate@layer2funnels.test");
  viewer = await signIn("viewer@layer2funnels.test");
  [ownerId, editorId, viewerId] = await Promise.all([idOf(owner), idOf(editor), idOf(viewer)]);
});
const TEAM = "00000000-0000-4000-a000-000000000001";
const member = (c: SupabaseClient) => c.from("workspace_members");
const roleOf = async (id: string) => (await member(owner).select("role").eq("workspace_id", TEAM).eq("user_id", id).single()).data?.role;
afterAll(async () => {
  // leave the seed as it was
  await member(owner).update({ role: "editor" }).eq("workspace_id", TEAM).eq("user_id", editorId);
  await member(owner).update({ role: "viewer" }).eq("workspace_id", TEAM).eq("user_id", viewerId);
});

describe("roles", () => {
  it("the seed has one owner, an editor and a viewer in the team workspace", async () => {
    expect(await roleOf(ownerId)).toBe("owner");
    expect(await roleOf(editorId)).toBe("editor");
    expect(await roleOf(viewerId)).toBe("viewer");
  });

  it("a viewer reads everything in the workspace", async () => {
    for (const t of ["clients", "funnels", "share_links", "products", "funnel_versions", "templates", "profiles"] as const) {
      const mine = await viewer.from(t).select("id");
      const theirs = await owner.from(t).select("id");
      expect(mine.error, t).toBeNull();
      expect((mine.data ?? []).length, t).toBe((theirs.data ?? []).length);
    }
  });

  it("a viewer can't create, change or delete anything", async () => {
    const ins = await viewer.from("clients").insert({ name: "Viewer client", owner_id: viewerId }).select("id");
    expect(ins.error).not.toBeNull();
    const upd = await viewer.from("clients").update({ name: "Hacked" }).eq("id", SAM).select("id");
    expect(upd.data ?? []).toEqual([]);
    const fu = await viewer.from("funnels").update({ name: "Hacked" }).eq("id", TRIPWIRE).select("id");
    expect(fu.data ?? []).toEqual([]);
    const del = await viewer.from("funnels").delete().eq("id", TRIPWIRE).select("id");
    expect(del.data ?? []).toEqual([]);
    const link = await viewer.from("share_links").insert({ funnel_id: TRIPWIRE }).select("id");
    expect(link.error).not.toBeNull();
    const ver = await viewer.from("funnel_versions").insert({ funnel_id: TRIPWIRE, graph: {}, settings: {}, label: "x" }).select("id");
    expect(ver.error).not.toBeNull();
    const act = await viewer.from("funnel_actuals").insert({ funnel_id: TRIPWIRE, node_id: "x", period_start: "2026-01-01", period_end: "2026-01-31" }).select("id");
    expect(act.error).not.toBeNull();
    const tpl = await viewer.from("templates").insert({ owner_id: viewerId, name: "T", graph: {}, settings: {} }).select("id");
    expect(tpl.error).not.toBeNull();
    const prod = await viewer.from("products").insert({ name: "P", type: "product", params: {} }).select("id");
    expect(prod.error).not.toBeNull();
    const up = await viewer.storage.from("logos").upload(`${viewerId}/x.png`, new Blob(["x"]), { contentType: "image/png" });
    expect(up.error).not.toBeNull();
    const still = await owner.from("clients").select("name").eq("id", SAM).single();
    expect(still.data!.name).toBe("Sam Carter");
  });

  it("a viewer can't make themselves an editor; an editor can't change roles", async () => {
    expect((await member(viewer).update({ role: "editor" }).eq("workspace_id", TEAM).eq("user_id", viewerId).select()).data ?? []).toEqual([]);
    expect((await member(editor).update({ role: "admin" }).eq("workspace_id", TEAM).eq("user_id", editorId).select()).data ?? []).toEqual([]);
    expect((await member(editor).update({ role: "editor" }).eq("workspace_id", TEAM).eq("user_id", viewerId).select()).data ?? []).toEqual([]);
    expect(await roleOf(viewerId)).toBe("viewer");
    expect(await roleOf(editorId)).toBe("editor");
  });

  it("an editor edits data", async () => {
    const r = await editor.from("clients").update({ notes: "Edited by an editor" }).eq("id", SAM).select("id");
    expect(r.data?.length).toBe(1);
  });

  it("admins manage roles below owner; nobody else can touch the owner", async () => {
    const set = (c: SupabaseClient, id: string, patch: object) => member(c).update(patch).eq("workspace_id", TEAM).eq("user_id", id);
    // the owner promotes the editor to admin, who then manages the viewer
    expect((await set(owner, editorId, { role: "admin" })).error).toBeNull();
    expect((await set(editor, viewerId, { role: "editor" })).error).toBeNull();
    expect((await viewer.from("clients").update({ notes: "now I can" }).eq("id", SAM).select("id")).data?.length).toBe(1);
    expect((await set(editor, viewerId, { role: "viewer" })).error).toBeNull();
    // an admin can't demote or deactivate the owner, or make themselves owner
    expect((await set(editor, ownerId, { role: "admin" })).error).not.toBeNull();
    expect((await set(editor, ownerId, { active: false })).error).not.toBeNull();
    expect((await set(editor, editorId, { role: "owner" })).error).not.toBeNull();
    expect(await roleOf(ownerId)).toBe("owner");
    // only the owner hands over ownership
    expect((await editor.rpc("transfer_ownership", { p_to: editorId })).error).not.toBeNull();
  });

  it("the owner hands over ownership (and can take it back)", async () => {
    expect((await owner.rpc("transfer_ownership", { p_to: viewerId })).error).toBeNull();
    expect([await roleOf(ownerId), await roleOf(viewerId)]).toEqual(["admin", "owner"]);
    expect((await viewer.rpc("transfer_ownership", { p_to: ownerId })).error).toBeNull();
    expect([await roleOf(ownerId), await roleOf(viewerId)]).toEqual(["owner", "admin"]);
    await member(owner).update({ role: "viewer" }).eq("workspace_id", TEAM).eq("user_id", viewerId);
    expect(await roleOf(viewerId)).toBe("viewer");
  });

  it("whoever creates a workspace owns it", async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return; // clean-up needs the local service key in .env.local
    const id = (await owner.rpc("create_workspace", { p_name: `Owned ${Date.now()}` })).data as string;
    try {
      expect((await member(owner).select("role").eq("workspace_id", id).eq("user_id", ownerId).single()).data?.role).toBe("owner");
    } finally {
      await owner.rpc("switch_workspace", { p_workspace: TEAM });
      await createClient(URL, key, { auth: { persistSession: false, autoRefreshToken: false } }).from("workspaces").delete().eq("id", id);
    }
  });

  it("ownership can't be handed to another workspace's account", async () => {
    const solo = await signIn("solo@independent.test");
    const soloId = await idOf(solo);
    expect((await owner.rpc("transfer_ownership", { p_to: soloId })).error).not.toBeNull();
  });
});
