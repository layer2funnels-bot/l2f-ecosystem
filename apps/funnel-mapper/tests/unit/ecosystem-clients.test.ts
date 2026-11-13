import { describe, expect, it } from "vitest";
import { createSharedClient, decisionMessage, listSharedClients, sharedClientsEnabled } from "@/lib/ecosystem/clients";

const fake = (status: number, body: unknown, seen: { url?: string; init?: RequestInit }[] = []) =>
  (async (url: string, init?: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
const cfg = (f: typeof fetch) => ({ url: "https://eco.example/", token: "tok", orgId: "org-1", fetchImpl: f });
const SAM = { id: "c1", name: "Sam Carter", email: "sam@x.test", business_name: null, status: "active" };

describe("shared clients (Funnel Mapper ↔ Clients)", () => {
  it("is off unless switched on with a service address", () => {
    expect(sharedClientsEnabled({})).toBe(false);
    expect(sharedClientsEnabled({ ECOSYSTEM_CLIENTS: "1" })).toBe(false);
    expect(sharedClientsEnabled({ ECOSYSTEM_CLIENTS: "1", ECOSYSTEM_API_URL: "https://eco.example" })).toBe(true);
  });
  it("sends the person's token and organization; trims input; never sends empty fields", async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const o = await createSharedClient(cfg(fake(200, { ok: true, data: [{ outcome: "created", client: SAM }] }, seen)), { name: " Sam Carter ", email: " sam@x.test ", business_name: "" });
    expect(o).toEqual({ kind: "created", client: SAM });
    expect(seen[0].url).toBe("https://eco.example/api/fmp.clients.create");
    const h = seen[0].init?.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer tok"); expect(h["x-org-id"]).toBe("org-1");
    expect(JSON.parse(String(seen[0].init?.body))).toEqual({ name: "Sam Carter", email: "sam@x.test" });
  });
  it("passes a duplicate decision back to the person instead of linking", async () => {
    const o = await createSharedClient(cfg(fake(200, { ok: true, data: [{ outcome: "needs_decision", reason: "email_exact", candidates: [{ ...SAM, match: "email_exact" }] }] })), { name: "S. Carter", email: "sam@x.test" });
    expect(o.kind).toBe("needs_decision");
    if (o.kind === "needs_decision") { expect(o.candidates[0].id).toBe("c1"); expect(decisionMessage(o)).toMatch(/already exists/); }
  });
  it("links only to the client the person chose", async () => {
    const seen: { url?: string; init?: RequestInit }[] = [];
    const o = await createSharedClient(cfg(fake(200, { ok: true, data: [{ outcome: "linked", client: SAM }] }, seen)), { name: "x", decision: "link", link_to: "c1" });
    expect(o.kind).toBe("linked"); expect(JSON.parse(String(seen[0].init?.body)).link_to).toBe("c1");
  });
  it("treats 'not found' as no permission and a network or server failure as unavailable (nothing saved)", async () => {
    expect((await createSharedClient(cfg(fake(200, { ok: true, data: [] })), { name: "x" })).kind).toBe("denied");
    expect((await createSharedClient(cfg(fake(404, { ok: false })), { name: "x" })).kind).toBe("denied");
    expect((await createSharedClient(cfg(fake(503, { ok: false })), { name: "x" })).kind).toBe("unavailable");
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const o = await createSharedClient(cfg(down), { name: "x" });
    expect(o).toEqual({ kind: "unavailable", message: expect.stringMatching(/nothing was saved/) });
  });
  it("a failed list is reported as unavailable, never as an empty client list", async () => {
    expect(await listSharedClients(cfg(fake(500, {})))).toEqual({ ok: false, message: expect.any(String) });
    expect(await listSharedClients(cfg(fake(200, { ok: true, data: [SAM] })))).toEqual({ ok: true, clients: [SAM] });
  });
});
