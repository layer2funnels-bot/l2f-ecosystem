// workspace_assets (style presets, workspace blocks): isolation and roles. Requires the local Supabase stack. Run: npm run test:db
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const signIn = async (email: string) => {
  const c: SupabaseClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "demo-password" });
  expect(error, email).toBeNull();
  return c;
};
let team: SupabaseClient, viewer: SupabaseClient, solo: SupabaseClient;
const made: string[] = [];

beforeAll(async () => {
  team = await signIn("demo@layer2funnels.test");
  viewer = await signIn("viewer@layer2funnels.test");
  solo = await signIn("solo@independent.test");
});
afterAll(async () => {
  for (const id of made) await team.from("workspace_assets").delete().eq("id", id);
});

describe("workspace_assets", () => {
  it("a team member saves a style preset; teammates (even viewers) read it", async () => {
    const { data, error } = await team.from("workspace_assets").insert({ kind: "style", name: "Brand emphasis", data: { border: "#10B981", borderW: 2 } }).select("id, workspace_id").single();
    expect(error).toBeNull();
    made.push(data!.id);
    const seen = await viewer.from("workspace_assets").select("id").eq("id", data!.id);
    expect(seen.data?.length).toBe(1);
  });

  it("a viewer can't save, change or remove presets", async () => {
    const ins = await viewer.from("workspace_assets").insert({ kind: "style", name: "Nope", data: {} }).select("id");
    expect(ins.error).not.toBeNull();
    const upd = await viewer.from("workspace_assets").update({ name: "Hacked" }).eq("id", made[0]).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await viewer.from("workspace_assets").delete().eq("id", made[0]).select("id");
    expect(del.data ?? []).toEqual([]);
  });

  it("an independent user can't see the team's assets, nor write into the team workspace", async () => {
    const seen = await solo.from("workspace_assets").select("id");
    expect((seen.data ?? []).some((r) => made.includes(r.id))).toBe(false);
    const team_ws = (await team.from("workspace_assets").select("workspace_id").eq("id", made[0]).single()).data!.workspace_id;
    const ins = await solo.from("workspace_assets").insert({ workspace_id: team_ws, kind: "block", name: "Injected", data: {} }).select("id");
    expect(ins.error).not.toBeNull();
    const mine = await solo.from("workspace_assets").insert({ kind: "style", name: "Private", data: { opacity: 0.5 } }).select("id").single();
    expect(mine.error).toBeNull();
    // and the team can't see the independent user's
    const theirs = await team.from("workspace_assets").select("id").eq("id", mine.data!.id);
    expect(theirs.data ?? []).toEqual([]);
    await solo.from("workspace_assets").delete().eq("id", mine.data!.id);
  });

  it("rejects an unknown kind, an empty name and an oversize payload", async () => {
    expect((await team.from("workspace_assets").insert({ kind: "weird", name: "x", data: {} })).error).not.toBeNull();
    expect((await team.from("workspace_assets").insert({ kind: "style", name: "", data: {} })).error).not.toBeNull();
    expect((await team.from("workspace_assets").insert({ kind: "block", name: "big", data: { x: "a".repeat(250_000) } })).error).not.toBeNull();
  });
});
