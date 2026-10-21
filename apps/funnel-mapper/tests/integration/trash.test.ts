// Trash (supabase/migrations/20261014000000_trash.sql) against the local Supabase stack.
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

const SAM = "10000000-0000-4000-8000-000000000001";
let owner: SupabaseClient, editor: SupabaseClient, viewer: SupabaseClient;
let funnelId = "",
  clientId = "",
  token = "";

beforeAll(async () => {
  owner = await signIn("demo@layer2funnels.test");
  editor = await signIn("teammate@layer2funnels.test");
  viewer = await signIn("viewer@layer2funnels.test");
  const uid = (await owner.auth.getUser()).data.user!.id;
  const c = await owner.from("clients").insert({ name: `Trash test ${Date.now()}`, owner_id: uid }).select("id").single();
  clientId = c.data!.id;
  const f = await owner.from("funnels").insert({ client_id: SAM, name: `Trash funnel ${Date.now()}`, graph: { nodes: [], edges: [] }, settings: {} }).select("id").single();
  funnelId = f.data!.id;
  token = `trash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const l = await owner.from("share_links").insert({ funnel_id: funnelId, token }).select("id").single();
  expect(l.error).toBeNull();
});
afterAll(async () => {
  await owner.from("funnels").delete().eq("id", funnelId);
  await owner.from("clients").delete().eq("id", clientId);
});

describe("trash", () => {
  it("an editor moves a funnel to Trash and back (an update); its share link stops working meanwhile", async () => {
    expect(await mk().rpc("get_shared_funnel", { p_token: token }).then((r) => r.data)).not.toBeNull();
    const t = await editor.from("funnels").update({ deleted_at: new Date().toISOString() }).eq("id", funnelId).select("id");
    expect(t.error).toBeNull();
    expect(t.data).toHaveLength(1);
    expect(await mk().rpc("get_shared_funnel", { p_token: token }).then((r) => r.data)).toBeNull();
    const c = await mk().rpc("add_share_comment", { p_token: token, p_node_id: "", p_author: "x", p_body: "y" });
    expect(c.error).not.toBeNull();
    const s = await mk().rpc("save_shared_funnel", { p_token: token, p_graph: { nodes: [], edges: [] }, p_settings: null });
    expect(s.error).not.toBeNull();
    await editor.from("funnels").update({ deleted_at: null }).eq("id", funnelId);
    expect(await mk().rpc("get_shared_funnel", { p_token: token }).then((r) => r.data)).not.toBeNull();
  });

  it("a funnel whose client is in Trash isn't shared either", async () => {
    await owner.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", SAM);
    try {
      expect(await mk().rpc("get_shared_funnel", { p_token: token }).then((r) => r.data)).toBeNull();
    } finally {
      await owner.from("clients").update({ deleted_at: null }).eq("id", SAM);
    }
  });

  it("only owners and admins delete forever; editors and viewers can't", async () => {
    const byEditor = await editor.from("clients").delete().eq("id", clientId).select("id");
    expect(byEditor.data ?? []).toEqual([]);
    const byViewer = await viewer.from("clients").delete().eq("id", clientId).select("id");
    expect(byViewer.data ?? []).toEqual([]);
    expect((await owner.from("clients").select("id").eq("id", clientId)).data).toHaveLength(1);
    const viewerTrash = await viewer.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", clientId).select("id");
    expect(viewerTrash.data ?? []).toEqual([]);
    const byOwner = await owner.from("clients").delete().eq("id", clientId).select("id");
    expect(byOwner.data).toHaveLength(1);
  });
});
