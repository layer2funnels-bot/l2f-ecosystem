"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { compute, summary } from "@/lib/funnel-math";
import { blankGraph, blankSettings, importFunnelFile, isCurrency, parseGraph, parseSettings, type CurrencyCode } from "@/lib/graph";
import { normalisePricing } from "@/lib/pricing";
import { clientFormSchema, FUNNEL_STATUSES, type ClientForm } from "@/lib/schemas";
import { requireUser } from "@/lib/supabase/server";
import { eco } from "@/lib/eco/server";
import { decisionMessage, type SharedClient } from "@/lib/ecosystem/clients";
import { builtinTemplate, reidGraph } from "@/lib/templates";
import { TEMPLATE13_BY_KEY, template13Graph } from "@/lib/templates13";

// Funnel Mapper on the ecosystem (stage 2): every read and write below is an ecosystem API operation run as the signed-in person;
// the API and database decide (organization, client scope, fmp.* permissions). "Not found" from the API means "not allowed or gone".

export type ActionResult = { error?: string; ok?: boolean; id?: string; added?: boolean; candidates?: SharedClient[] } | undefined;
const uuid = z.uuid();
const newId = () => "n" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

const VIEWER = "Viewers can look but not change anything. Ask an admin for edit access.";
const MANAGED = "Team, invitations, roles, branding and organizations are managed in the ecosystem: Office › Admin.";
const NOT_ALLOWED = "That isn’t available to you (it may have been removed, or you don’t have access).";
/** Signed-in member who may change data (owner, admin or editor). The database enforces the same rule. */
async function requireEditor() {
  const ctx = await requireUser();
  if (!ctx.canEdit) throw new Error(VIEWER);
  return ctx;
}
/** One operation; its rows, or a plain-language error (never database text). */
async function run<T = Record<string, unknown>>(op: string, input: unknown): Promise<{ rows: T[]; error?: string }> {
  const r = await eco<T>(op, input);
  return r.ok ? { rows: r.data } : { rows: [], error: r.message };
}
async function must<T = Record<string, unknown>>(op: string, input: unknown): Promise<T[]> {
  const r = await run<T>(op, input);
  if (r.error) throw new Error(r.error);
  return r.rows;
}

function formObject(fd: FormData) {
  const o: Record<string, FormDataEntryValue> = {};
  fd.forEach((v, k) => (o[k] = v));
  return o;
}

/* ---------------- clients ---------------- */
/** Validated client form → row values: only the fields of the chosen pricing model are kept. */
function clientValues(fd: FormData): { error: string } | { data: ClientForm } {
  const p = clientFormSchema.safeParse(formObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const d = normalisePricing(p.data);
  if (d.project_start && d.project_end && d.project_end < d.project_start) return { error: "The project end date is before its start date" };
  return { data: d };
}

/** The client form's values for the shared client (identity) and Funnel Mapper's own terms. */
function clientPayload(d: ClientForm, withNotes: boolean) {
  return {
    name: d.name, business_name: d.business_name, niche: d.niche, email: d.email, phone: d.phone, website: d.website, country: d.country,
    ...(isCurrency(d.currency) ? { currency: d.currency } : {}), status: d.status, tags: d.tags.slice(0, 20),
    monthly_retainer: d.monthly_retainer, pricing_model: d.pricing_model, pricing_amount: d.pricing_amount, billing_frequency: d.billing_frequency,
    hours_per_month: d.hours_per_month, commission_pct: d.commission_pct, pricing_notes: d.pricing_notes,
    ...(d.project_start ? { project_start: d.project_start } : {}), ...(d.project_end ? { project_end: d.project_end } : {}),
    ...(!d.project_start && !d.project_end ? { clear_project_dates: true } : {}),
    ...(withNotes ? { notes: d.notes } : {}),
  };
}

/**
 * New client: created in (or, after the person chose, linked to) the shared client list (Clients app), then Funnel Mapper's own
 * pricing and notes are saved. Possible duplicates are never linked automatically: the form shows them and the person decides.
 */
export async function createClientAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  const p = clientValues(fd);
  if ("error" in p) return { error: p.error };
  const decision = fd.get("shared_decision"); const linkTo = fd.get("shared_link_to");
  const r = await run<{ outcome: string; client?: SharedClient; reason?: string; candidates?: SharedClient[] }>("fmp.clients.create", {
    name: p.data.name, ...(p.data.email ? { email: p.data.email } : {}), ...(p.data.business_name ? { business_name: p.data.business_name } : {}), status: p.data.status,
    ...(decision === "new" || decision === "link" ? { decision } : {}), ...(typeof linkTo === "string" && decision === "link" ? { link_to: linkTo } : {}),
  });
  if (r.error) return { error: r.error };
  const o = r.rows[0];
  if (!o) return { error: "You can’t add clients here. Ask an admin for access." };
  if (o.outcome === "needs_decision") {
    return { error: decisionMessage({ kind: "needs_decision", reason: (o.reason ?? "possible_duplicate") as "email_exact", candidates: o.candidates ?? [] }), candidates: o.candidates ?? [] };
  }
  const id = o.client!.id;
  // linking keeps the existing client's details as they are; only Funnel Mapper's own terms are added
  const payload = clientPayload(p.data, true);
  const own = o.outcome === "linked"
    ? Object.fromEntries(Object.entries(payload).filter(([k]) => !["name", "business_name", "niche", "email", "phone", "website", "country", "currency", "status", "tags"].includes(k)))
    : payload;
  const u = await run("fmp.clients.update", { id, ...own });
  if (u.error) return { error: `The client was saved, but its Funnel Mapper details weren’t: ${u.error}` };
  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${id}`);
}

export async function updateClientAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  if (!uuid.safeParse(id).success) return { error: "Unknown client" };
  const p = clientValues(fd);
  if ("error" in p) return { error: p.error };
  // notes autosave separately on the portfolio page; the details form must never overwrite them
  const r = await run("fmp.clients.update", { id, ...clientPayload(p.data, fd.has("notes")) });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { ok: true };
}

export async function updateClientFields(id: string, fields: { notes?: string; logo_path?: string | null; status?: string }) {
  await requireEditor();
  const p = clientFormSchema.pick({ notes: true, status: true }).partial().extend({ logo_path: z.string().max(400).nullable().optional() }).parse(fields);
  const rows = await must("fmp.clients.update", { id: uuid.parse(id), ...(p.notes !== undefined ? { notes: p.notes } : {}), ...(p.status ? { status: p.status } : {}),
    ...(p.logo_path !== undefined ? { logo_path: p.logo_path ?? "" } : {}) });
  if (!rows.length) throw new Error(NOT_ALLOWED);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

/** Archive (or restore) a client: it leaves the active portfolio and dashboard (also in the Clients app, same client); nothing is deleted. */
export async function archiveClientAction(id: string, archive: boolean) {
  await requireEditor();
  const rows = await must("fmp.clients.update", { id: uuid.parse(id), archived: archive });
  if (!rows.length) throw new Error(NOT_ALLOWED);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  revalidatePath("/");
}

/* ---------------- trash (V2 F6): no time limit, nothing removed automatically ---------------- */
const ADMINS_ONLY = "Only the organization owner can delete forever. Ask them, or keep it in Trash.";
function revalidateLists(clientId?: string) {
  revalidatePath("/clients");
  revalidatePath("/funnels");
  revalidatePath("/trash");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/** Move a client to Funnel Mapper's Trash. Its funnels go with it (same moment), so restoring the client brings them back. The client stays in the Clients app. */
export async function trashClientAction(id: string) {
  await requireEditor();
  const cid = uuid.parse(id);
  const rows = await must("fmp.clients.trash", { client: cid });
  if (!rows.length) throw new Error(NOT_ALLOWED);
  revalidateLists(cid);
  redirect("/clients?trashed=1");
}

/** Move a funnel to Trash (its share links stop working until it is restored). */
export async function trashFunnelAction(id: string) {
  await requireEditor();
  const rows = await must<{ client_id: string }>("fmp.funnels.trash", { id: uuid.parse(id) });
  if (!rows.length) throw new Error(NOT_ALLOWED);
  revalidateLists(rows[0].client_id);
}

/** Restore from Trash. A client brings back the funnels that went to Trash with it; a funnel of a client in Trash brings its client back too. */
export async function restoreAction(kind: "client" | "funnel", id: string): Promise<ActionResult> {
  await requireEditor();
  const rid = uuid.parse(id);
  if (kind === "client") {
    const r = await run("fmp.clients.restore", { client: rid });
    if (r.error) return { error: r.error };
    if (!r.rows.length) return { error: NOT_ALLOWED };
    revalidateLists(rid);
    return { ok: true };
  }
  const r = await run<{ client_id: string }>("fmp.funnels.restore", { id: rid });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  const cid = r.rows[0].client_id;
  const trashedClient = (await run<{ id: string }>("fmp.clients.trashed", {})).rows.some((c) => c.id === cid);
  if (trashedClient) await run("fmp.clients.restore", { client: cid });
  revalidateLists(cid);
  return { ok: true };
}

/** Delete one item forever (owner only; the database refuses anyone else). Only items already in Trash. A client's shared record stays in Clients. */
export async function deleteForeverAction(kind: "client" | "funnel", id: string): Promise<ActionResult> {
  const { isOwner } = await requireEditor();
  if (!isOwner) return { error: ADMINS_ONLY };
  const rid = uuid.parse(id);
  const r = await run(kind === "client" ? "fmp.clients.purge" : "fmp.funnels.purge", kind === "client" ? { client: rid } : { id: rid });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: "That item isn’t in Trash any more, or only the owner can delete it forever." };
  revalidateLists();
  return { ok: true };
}

/** Empty Trash: every funnel and client in Funnel Mapper's Trash in this organization (owner only). */
export async function emptyTrashAction(): Promise<ActionResult> {
  const { isOwner } = await requireEditor();
  if (!isOwner) return { error: ADMINS_ONLY };
  const f = await run("fmp.funnels.purge", {});
  if (f.error) return { error: f.error };
  const c = await run("fmp.clients.purge", {});
  if (c.error) return { error: c.error };
  revalidateLists();
  return { ok: true };
}

/* ---------------- funnels ---------------- */
const newFunnelSchema = z.object({
  client_id: z.uuid("Pick a client"),
  name: z.string().trim().max(160).optional(),
  source: z.string().default("blank"), // "blank" | "builtin:<key>" | "template:<uuid>"
  custom: z.string().max(50_000).optional(),
  skip: z.string().optional(),
});
/** The template customize form (all optional): page names, URLs, captured screenshots, empty numbers. */
const customSchema = z.object({
  empty: z.boolean().default(false),
  names: z.record(z.string().max(40), z.string().max(120)).default({}),
  urls: z.record(z.string().max(40), z.string().max(2000)).default({}),
  shots: z.record(z.string().max(40), z.string().max(300)).default({}),
});

export async function createFunnelAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { user, canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  const p = newFunnelSchema.safeParse(formObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const client = (await run<{ id: string; currency: string }>("fmp.clients.full", { id: p.data.client_id })).rows[0];
  if (!client) return { error: "Client not found" };
  const currency: CurrencyCode = isCurrency(client.currency) ? client.currency : "GBP";
  let graph = blankGraph(),
    settings = blankSettings(currency),
    name = "Untitled funnel",
    description = "";
  if (p.data.source.startsWith("builtin:") && TEMPLATE13_BY_KEY[p.data.source.slice(8)]) {
    // one of the 13 approved templates, with the customize form's answers unless "Skip, use defaults"
    const key = p.data.source.slice(8);
    let c = customSchema.parse({});
    if (!p.data.skip && p.data.custom) {
      try {
        c = customSchema.parse(JSON.parse(p.data.custom));
      } catch {
        return { error: "The template form couldn’t be read. Try again." };
      }
    }
    // screenshots may only come from this person's own folder (the capture route stores them there)
    const shots = Object.fromEntries(Object.entries(c.shots).filter(([, v]) => v.startsWith(`${user.id}/`)));
    graph = reidGraph(template13Graph(key, { ...c, shots }), newId);
    name = TEMPLATE13_BY_KEY[key].name;
    description = TEMPLATE13_BY_KEY[key].description;
  } else if (p.data.source.startsWith("builtin:")) {
    const t = builtinTemplate(p.data.source.slice(8));
    graph = reidGraph(t.graph, newId);
    name = t.name;
    description = t.description;
  } else if (p.data.source.startsWith("template:")) {
    const t = (await run<{ graph: unknown; settings: unknown; name: string; description: string }>("fmp.templates.get", { id: uuid.parse(p.data.source.slice(9)) })).rows[0];
    if (!t) return { error: "Template not found" };
    graph = reidGraph(parseGraph(t.graph), newId);
    settings = { ...parseSettings(t.settings), currency };
    name = t.name;
    description = t.description;
  }
  if (p.data.name) name = p.data.name;
  const r = await run<{ id: string }>("fmp.funnels.create", { client: client.id, name, description, graph, settings, summary: summary(compute(graph, settings)) });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  revalidatePath(`/clients/${client.id}`);
  redirect(`/funnels/${r.rows[0].id}`);
}

export async function duplicateFunnelAction(id: string) {
  await requireEditor();
  const f = (await must<{ client_id: string; name: string; description: string; graph: unknown; settings: Record<string, unknown>; summary: Record<string, unknown> }>("fmp.funnels.get", { id: uuid.parse(id) }))[0];
  if (!f) throw new Error("Funnel not found");
  const graph = reidGraph(parseGraph(f.graph), newId);
  const rows = await must("fmp.funnels.create", { client: f.client_id, name: `${f.name} (copy)`.slice(0, 200), description: f.description, status: "draft", graph, settings: f.settings, summary: f.summary });
  if (!rows.length) throw new Error(NOT_ALLOWED);
  revalidateLists(f.client_id);
}

/** Rename a funnel from the list (F2 inline rename). */
export async function renameFunnelAction(id: string, name: string): Promise<ActionResult> {
  await requireEditor();
  const n = name.trim().slice(0, 120);
  if (!n) return { error: "A funnel needs a name" };
  const r = await run<{ client_id: string }>("fmp.funnels.update", { id: uuid.parse(id), name: n });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  revalidateLists(r.rows[0].client_id);
  return { ok: true };
}

/** Move a funnel to another client of the same workspace (RLS rejects any other client). */
export async function moveFunnelAction(id: string, clientId: string): Promise<ActionResult> {
  await requireEditor();
  const fid = uuid.parse(id);
  const cid = uuid.parse(clientId);
  const before = (await run<{ client_id: string }>("fmp.funnels.get", { id: fid })).rows[0];
  const client = (await run<{ id: string; trashed_at: string | null }>("fmp.clients.full", { id: cid })).rows[0];
  if (!client || client.trashed_at) return { error: "That client isn’t available" };
  const r = await run("fmp.funnels.update", { id: fid, client: cid });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  revalidateLists(cid);
  if (before?.client_id) revalidatePath(`/clients/${before.client_id}`);
  return { ok: true };
}

export async function setFunnelStatusAction(id: string, status: string) {
  await requireEditor();
  const s = z.enum(FUNNEL_STATUSES).parse(status);
  const rows = await must<{ client_id: string }>("fmp.funnels.update", { id: uuid.parse(id), status: s });
  if (!rows.length) throw new Error(NOT_ALLOWED);
  revalidateLists(rows[0].client_id);
}

/* ---------------- templates ---------------- */
export async function deleteTemplateAction(id: string) {
  await requireEditor();
  await must("fmp.templates.delete", { id: uuid.parse(id) });
  revalidatePath("/templates");
}

/* ---------------- profile, organization settings ---------------- */

/** Funnel Mapper's own organization setting: the default currency for new clients and funnels (admins). Name and logo live in Office › Admin › Branding. */
export async function updateWorkspaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { isAdmin } = await requireUser();
  if (!isAdmin) return { error: "Only admins can change this." };
  const p = z.object({ default_currency: z.string().refine(isCurrency, "Pick a currency") }).safeParse({ default_currency: fd.get("default_currency") });
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await run("fmp.settings.set", { default_currency: p.data.default_currency });
  if (r.error) return { error: r.error };
  revalidatePath("/", "layout");
  return { ok: true };
}

// Team, invitations, roles, ownership, branding and independent accounts are managed by the ecosystem now (Office › Admin);
// these keep their names so older screens compile, and say where to go.

/** Funnel Mapper's pages as the ecosystem's switching rule knows them (migration 0053 app_pages). */
const PAGE_OF = (path: string): string =>
  path === "/" ? "home" : /^\/clients\/[0-9a-f-]{36}/.test(path) ? "client" : /^\/funnels\/[0-9a-f-]{36}/.test(path) ? "funnel"
    : (["clients", "funnels", "templates", "trash", "settings"].find((k) => path === `/${k}` || path.startsWith(`/${k}/`)) ?? "home");
const PATH_OF: Record<string, string> = { home: "/", clients: "/clients", funnels: "/funnels", templates: "/templates", trash: "/trash", settings: "/settings" };
export type SwitchResult = { to: string; message?: string; error?: string };

/**
 * Switch organization exactly as every ecosystem app does (`org.switch`, design 01): the ecosystem remembers it for all apps; you stay on
 * the same page when it exists; a client or funnel never comes along (you land on its list); if Funnel Mapper isn't on there, you are told.
 */
export async function switchWorkspaceAction(id: string, path = "/"): Promise<SwitchResult> {
  const oid = uuid.parse(id);
  const r = await eco<{ outcome: string; org_id: string | null; org_name: string | null; page_key: string | null; message: string | null }>("org.switch", { org: oid, app: "funnel_mapper_pro", page: PAGE_OF(path) });
  const x = r.ok ? r.data[0] : undefined;
  if (!x) return { to: path, error: `Couldn’t switch. The connection dropped before your access was confirmed. Nothing was changed.` };
  if (x.outcome === "not_available") return { to: path, error: x.message ?? "You don’t have access to that organization. Nothing was changed." };
  revalidatePath("/", "layout");
  if (x.outcome === "app_unavailable") return { to: "/unavailable" };
  return { to: PATH_OF[x.page_key ?? "home"] ?? "/", message: x.message ?? `Now in ${x.org_name}.` };
}

/* ---------------- products (reusable offers) ---------------- */
const OFFER_TYPES = ["checkout", "product", "bump", "upsell", "downsell", "sub", "trial", "plan", "hightick", "service", "digital", "coursep", "coaching", "membership", "oto", "bundle", "coupon", "freeoffer", "onestep", "twostep", "cartoffer"] as const;
const productSchema = z.object({
  id: z.uuid().optional(),
  client_id: z.uuid().nullable(),
  name: z.string().trim().min(1, "Name the product").max(120),
  type: z.enum(OFFER_TYPES),
  notes: z.string().max(2000).default(""),
  params: z.object({
    price: z.number().min(0).default(0),
    cr: z.number().min(0).max(100).default(10),
    newc: z.boolean().default(false),
    disc: z.number().min(0).max(100).default(0),
    refund: z.number().min(0).max(100).default(0),
    fulfil: z.number().min(0).default(0),
    aff: z.number().min(0).max(100).default(0),
    interval: z.enum(["weekly", "monthly", "quarterly", "yearly"]).optional(),
    life: z.number().min(0).optional(),
    trialDays: z.number().min(0).optional(),
    trialPrice: z.number().min(0).optional(),
    setup: z.number().min(0).optional(),
    pays: z.number().int().min(1).optional(),
  }),
});
export type ProductInput = z.input<typeof productSchema>;

export async function saveProductAction(input: ProductInput): Promise<ActionResult> {
  const { canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  const p = productSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, client_id, ...row } = p.data;
  const r = await run("fmp.products.save", { ...(id ? { id } : {}), ...(client_id ? { client: client_id } : {}), name: row.name, type: row.type, params: row.params, notes: row.notes });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  const row2 = { client_id };
  if (row2.client_id) revalidatePath(`/clients/${row2.client_id}`);
  return { ok: true };
}

export async function deleteProductAction(id: string, clientId: string | null) {
  await requireEditor();
  await must("fmp.products.delete", { id: uuid.parse(id) });
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/* ---------------- import ---------------- */
/** Create a new funnel for a client from an exported .json file (this app's format or the prototype's). */
export async function importFunnelAction(clientId: string, json: string): Promise<ActionResult> {
  const { canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  if (!uuid.safeParse(clientId).success) return { error: "Unknown client" };
  if (json.length > 5_000_000) return { error: "That file is too large" };
  let d;
  try {
    d = importFunnelFile(JSON.parse(json));
  } catch {
    return { error: "That file isn’t a Funnel Mapper .json file" };
  }
  const graph = reidGraph(d.graph, newId);
  const r = await run<{ id: string }>("fmp.funnels.create", { client: clientId, name: (d.name || "Imported funnel").slice(0, 200), description: d.description ?? "", graph, settings: d.settings, summary: summary(compute(graph, d.settings)) });
  if (r.error) return { error: r.error };
  if (!r.rows.length) return { error: NOT_ALLOWED };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, id: r.rows[0].id };
}
