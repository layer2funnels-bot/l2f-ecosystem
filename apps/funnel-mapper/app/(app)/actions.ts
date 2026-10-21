"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { compute, summary } from "@/lib/funnel-math";
import { blankGraph, blankSettings, importFunnelFile, isCurrency, parseGraph, parseSettings, type CurrencyCode } from "@/lib/graph";
import { clearPendingSignup, startIndependentSignup } from "@/lib/independent";
import { normalisePricing } from "@/lib/pricing";
import { clientFormSchema, FUNNEL_STATUSES, type ClientForm } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";
import { builtinTemplate, reidGraph } from "@/lib/templates";
import { TEMPLATE13_BY_KEY, template13Graph } from "@/lib/templates13";

export type ActionResult = { error?: string; ok?: boolean; id?: string; added?: boolean } | undefined;
const uuid = z.uuid();
const newId = () => "n" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

const VIEWER = "Viewers can look but not change anything. Ask an admin for edit access.";
/** Signed-in member who may change data (owner, admin or editor). RLS enforces the same rule. */
async function requireEditor() {
  const ctx = await requireUser();
  if (!ctx.canEdit) throw new Error(VIEWER);
  return ctx;
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

export async function createClientAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { sb, user, canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  const p = clientValues(fd);
  if ("error" in p) return { error: p.error };
  const { data, error } = await sb.from("clients").insert({ ...p.data, owner_id: user.id }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/clients");
  revalidatePath("/");
  redirect(`/clients/${data.id}`);
}

export async function updateClientAction(id: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const { sb, canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  if (!uuid.safeParse(id).success) return { error: "Unknown client" };
  const p = clientValues(fd);
  if ("error" in p) return { error: p.error };
  // notes autosave separately on the portfolio page; the details form must never overwrite them
  const { notes: _notes, ...fields } = p.data; // eslint-disable-line @typescript-eslint/no-unused-vars
  const { error } = await sb.from("clients").update(fd.has("notes") ? p.data : fields).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  return { ok: true };
}

export async function updateClientFields(id: string, fields: { notes?: string; logo_url?: string | null; status?: string }) {
  const { sb } = await requireEditor();
  const p = clientFormSchema.pick({ notes: true, status: true }).partial().extend({ logo_url: z.url().nullable().optional() }).parse(fields);
  const { error } = await sb.from("clients").update(p).eq("id", uuid.parse(id));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

/** Archive (or restore) a client: it leaves the active portfolio and dashboard; nothing is deleted. */
export async function archiveClientAction(id: string, archive: boolean) {
  const { sb } = await requireEditor();
  const { error } = await sb.from("clients").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", uuid.parse(id));
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
  revalidatePath("/");
}

/* ---------------- trash (V2 F6): no time limit, nothing removed automatically ---------------- */
const ADMINS_ONLY = "Only the workspace owner or an admin can delete forever. Ask one of them, or keep it in Trash.";
function revalidateLists(clientId?: string) {
  revalidatePath("/clients");
  revalidatePath("/funnels");
  revalidatePath("/trash");
  revalidatePath("/");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/** Move a client to Trash. Its funnels go with it (same moment), so restoring the client brings them back. */
export async function trashClientAction(id: string) {
  const { sb, user } = await requireEditor();
  const cid = uuid.parse(id);
  const at = new Date().toISOString();
  const { error } = await sb.from("clients").update({ deleted_at: at, deleted_by: user.id }).eq("id", cid).is("deleted_at", null);
  if (error) throw new Error(error.message);
  const { error: fErr } = await sb.from("funnels").update({ deleted_at: at, deleted_by: user.id }).eq("client_id", cid).is("deleted_at", null);
  if (fErr) throw new Error(fErr.message);
  revalidateLists(cid);
  redirect("/clients?trashed=1");
}

/** Move a funnel to Trash (its share links stop working until it is restored). */
export async function trashFunnelAction(id: string) {
  const { sb, user } = await requireEditor();
  const { data, error } = await sb.from("funnels").update({ deleted_at: new Date().toISOString(), deleted_by: user.id }).eq("id", uuid.parse(id)).select("client_id").single();
  if (error) throw new Error(error.message);
  revalidateLists(data.client_id);
}

/** Restore from Trash. A client brings back the funnels that went to Trash with it; a funnel of a client in Trash brings its client back too. */
export async function restoreAction(kind: "client" | "funnel", id: string): Promise<ActionResult> {
  const { sb } = await requireEditor();
  const rid = uuid.parse(id);
  if (kind === "client") {
    const { data: c, error } = await sb.from("clients").select("id, deleted_at").eq("id", rid).single();
    if (error) return { error: error.message };
    if (c.deleted_at) await sb.from("funnels").update({ deleted_at: null, deleted_by: null }).eq("client_id", rid).eq("deleted_at", c.deleted_at);
    const { error: e2 } = await sb.from("clients").update({ deleted_at: null, deleted_by: null }).eq("id", rid);
    if (e2) return { error: e2.message };
    revalidateLists(rid);
    return { ok: true };
  }
  const { data: f, error } = await sb.from("funnels").update({ deleted_at: null, deleted_by: null }).eq("id", rid).select("client_id").single();
  if (error) return { error: error.message };
  await sb.from("clients").update({ deleted_at: null, deleted_by: null }).eq("id", f.client_id).not("deleted_at", "is", null);
  revalidateLists(f.client_id);
  return { ok: true };
}

/** Delete one item forever (owner / admin only; the database refuses anyone else). Only items already in Trash. */
export async function deleteForeverAction(kind: "client" | "funnel", id: string): Promise<ActionResult> {
  const { sb, isAdmin } = await requireEditor();
  if (!isAdmin) return { error: ADMINS_ONLY };
  const rid = uuid.parse(id);
  const { error, count } = await sb
    .from(kind === "client" ? "clients" : "funnels")
    .delete({ count: "exact" })
    .eq("id", rid)
    .not("deleted_at", "is", null);
  if (error) return { error: error.message };
  if (!count) return { error: "That item isn’t in Trash any more." };
  revalidateLists();
  return { ok: true };
}

/** Empty Trash: every client and funnel in Trash in this workspace (owner / admin only). */
export async function emptyTrashAction(): Promise<ActionResult> {
  const { sb, isAdmin } = await requireEditor();
  if (!isAdmin) return { error: ADMINS_ONLY };
  const { error: fErr } = await sb.from("funnels").delete().not("deleted_at", "is", null);
  if (fErr) return { error: fErr.message };
  const { error } = await sb.from("clients").delete().not("deleted_at", "is", null);
  if (error) return { error: error.message };
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
  const { sb, user, canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  const p = newFunnelSchema.safeParse(formObject(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const { data: client } = await sb.from("clients").select("id, currency").eq("id", p.data.client_id).single();
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
    const { data: t } = await sb.from("templates").select("*").eq("id", uuid.parse(p.data.source.slice(9))).single();
    if (!t) return { error: "Template not found" };
    graph = reidGraph(parseGraph(t.graph), newId);
    settings = { ...parseSettings(t.settings), currency };
    name = t.name;
    description = t.description;
  }
  if (p.data.name) name = p.data.name;
  const { data, error } = await sb
    .from("funnels")
    .insert({ client_id: client.id, owner_id: user.id, name, description, graph: graph as never, settings: settings as never, summary: summary(compute(graph, settings)) as never })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/clients/${client.id}`);
  redirect(`/funnels/${data.id}`);
}

export async function duplicateFunnelAction(id: string) {
  const { sb, user } = await requireEditor();
  const { data: f } = await sb.from("funnels").select("*").eq("id", uuid.parse(id)).single();
  if (!f) throw new Error("Funnel not found");
  const graph = reidGraph(parseGraph(f.graph), newId);
  const { error } = await sb.from("funnels").insert({
    client_id: f.client_id,
    owner_id: user.id,
    name: `${f.name} (copy)`,
    description: f.description,
    status: "draft",
    graph: graph as never,
    settings: f.settings,
    summary: f.summary,
  });
  if (error) throw new Error(error.message);
  revalidateLists(f.client_id);
}

/** Rename a funnel from the list (F2 inline rename). */
export async function renameFunnelAction(id: string, name: string): Promise<ActionResult> {
  const { sb } = await requireEditor();
  const n = name.trim().slice(0, 120);
  if (!n) return { error: "A funnel needs a name" };
  const { data, error } = await sb.from("funnels").update({ name: n }).eq("id", uuid.parse(id)).select("client_id").single();
  if (error) return { error: error.message };
  revalidateLists(data.client_id);
  return { ok: true };
}

/** Move a funnel to another client of the same workspace (RLS rejects any other client). */
export async function moveFunnelAction(id: string, clientId: string): Promise<ActionResult> {
  const { sb } = await requireEditor();
  const fid = uuid.parse(id);
  const cid = uuid.parse(clientId);
  const { data: before } = await sb.from("funnels").select("client_id").eq("id", fid).single();
  const { data: client } = await sb.from("clients").select("id").eq("id", cid).is("deleted_at", null).single();
  if (!client) return { error: "That client isn’t available" };
  const { error } = await sb.from("funnels").update({ client_id: cid }).eq("id", fid);
  if (error) return { error: error.message };
  revalidateLists(cid);
  if (before?.client_id) revalidatePath(`/clients/${before.client_id}`);
  return { ok: true };
}

export async function setFunnelStatusAction(id: string, status: string) {
  const { sb } = await requireEditor();
  const s = z.enum(FUNNEL_STATUSES).parse(status);
  const { data, error } = await sb.from("funnels").update({ status: s }).eq("id", uuid.parse(id)).select("client_id").single();
  if (error) throw new Error(error.message);
  revalidateLists(data.client_id);
}

/* ---------------- templates ---------------- */
export async function deleteTemplateAction(id: string) {
  const { sb } = await requireEditor();
  const { error } = await sb.from("templates").delete().eq("id", uuid.parse(id));
  if (error) throw new Error(error.message);
  revalidatePath("/templates");
}

/* ---------------- profile & workspace ---------------- */
export async function updateProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { sb, user } = await requireUser();
  const p = z.object({ full_name: z.string().trim().max(120) }).safeParse({ full_name: fd.get("full_name") ?? "" });
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await sb.from("profiles").update(p.data).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.isAdmin) throw new Error("Only workspace admins can do that");
  return ctx;
}

export async function updateWorkspaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { sb, isAdmin, workspace } = await requireUser();
  if (!isAdmin) return { error: "Only workspace admins can change branding" };
  const p = z
    .object({ agency_name: z.string().trim().min(1, "Enter the agency name").max(120), default_currency: z.string().refine(isCurrency, "Pick a currency") })
    .safeParse({ agency_name: fd.get("agency_name"), default_currency: fd.get("default_currency") });
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await sb.from("workspaces").update(p.data).eq("id", workspace.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateAgencyLogo(url: string | null) {
  const { sb, workspace } = await requireAdmin();
  const { error } = await sb.from("workspaces").update({ agency_logo_url: z.url().nullable().parse(url) }).eq("id", workspace.id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

const ASSIGNABLE = ["admin", "editor", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE)[number];

/** Change a member's role (admin / editor / viewer) or activation in this workspace. The owner is changed only by handover. */
export async function setMemberAction(id: string, patch: { role?: AssignableRole; active?: boolean }): Promise<ActionResult> {
  const { sb, workspace } = await requireAdmin();
  const p = z.object({ role: z.enum(ASSIGNABLE).optional(), active: z.boolean().optional() }).parse(patch);
  const { error } = await sb.from("workspace_members").update(p).eq("workspace_id", workspace.id).eq("user_id", uuid.parse(id));
  if (error)
    return {
      error: error.message.includes("at least one active admin")
        ? "The workspace needs at least one active admin."
        : error.message.includes("ownership")
          ? "The owner’s role can’t be changed. The owner can hand over ownership instead."
          : error.message,
    };
  revalidatePath("/settings");
  return { ok: true };
}

/** The owner hands this workspace to another active member (the owner becomes an admin). */
export async function transferOwnershipAction(id: string): Promise<ActionResult> {
  const { sb, isOwner } = await requireUser();
  if (!isOwner) return { error: "Only the owner can hand over the workspace." };
  const { error } = await sb.rpc("transfer_ownership", { p_to: uuid.parse(id) });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Remove a teammate from the current workspace. Everything they created here is first handed to the admin removing
 * them. If they belong to no other workspace, their account (and email) is deleted too; otherwise they keep access
 * to their other workspaces. Workspace admins only, never yourself.
 */
export async function removeMemberAction(id: string): Promise<ActionResult> {
  const { sb, user, workspace } = await requireAdmin();
  const target = uuid.parse(id);
  if (target === user.id) return { error: "You can’t remove yourself." };
  const { data: member } = await sb.from("workspace_members").select("user_id, role").eq("workspace_id", workspace.id).eq("user_id", target).maybeSingle();
  if (!member) return { error: "That person isn’t in this workspace." };
  if (member.role === "owner") return { error: "The owner can’t be removed. The owner can hand over ownership first." };
  const admin = supabaseAdmin();
  if (!admin) return { error: "Removing teammates needs SUPABASE_SERVICE_ROLE_KEY on the server. Until then, deactivate them." };
  for (const t of ["clients", "funnels", "funnel_versions", "funnel_actuals", "share_links", "share_comments", "templates", "products"] as const) {
    const { error } = await admin.from(t).update({ owner_id: user.id }).eq("owner_id", target).eq("workspace_id", workspace.id);
    if (error) return { error: `Couldn’t transfer their work (${t}): ${error.message}. Nothing was removed.` };
  }
  const left = await admin.from("workspace_members").delete().eq("workspace_id", workspace.id).eq("user_id", target);
  if (left.error) return { error: `Their work is now yours, but they couldn’t be removed: ${left.error.message}` };
  // still in other workspaces: keep the account and move them out of this one; otherwise delete the account
  const { data: others } = await admin.from("workspace_members").select("workspace_id, active").eq("user_id", target).order("active", { ascending: false });
  if (others?.length) {
    await admin.from("profiles").update({ workspace_id: others[0].workspace_id }).eq("id", target).eq("workspace_id", workspace.id);
  } else {
    const { error } = await admin.auth.admin.deleteUser(target);
    if (error) return { error: `Removed from the workspace, but the account couldn’t be deleted: ${error.message}` };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/** Where invite links send people back to: NEXT_PUBLIC_SITE_URL, else the address this request came in on. */
async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** Invite a teammate into the current workspace (its admins only). Someone who already has an account is added directly. */
export async function inviteMemberAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { isTeam, workspace } = await requireAdmin();
  const p = z
    .object({ email: z.email("Enter a valid email"), full_name: z.string().trim().max(120).default(""), role: z.enum(ASSIGNABLE).default("editor") })
    .safeParse({ email: fd.get("email"), full_name: fd.get("full_name") ?? "", role: fd.get("role") || undefined });
  if (!p.success) return { error: p.error.issues[0].message };
  const admin = supabaseAdmin();
  if (!admin) return { error: "In-app invites need SUPABASE_SERVICE_ROLE_KEY on the server. Until then, invite from Supabase → Authentication → Users → Invite user." };
  const email = p.data.email.trim().toLowerCase();
  // the team workspace is where new accounts land by default; any other workspace needs a pending row naming it
  if (isTeam) await clearPendingSignup(email);
  else {
    const pending = await admin.from("workspace_signups").upsert({ email, full_name: p.data.full_name, workspace_name: "", join_workspace_id: workspace.id });
    if (pending.error) return { error: pending.error.message };
  }
  const site = await siteUrl();
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: p.data.full_name }, redirectTo: site ? `${site}/auth/callback?next=/update-password` : undefined });
  if (!isTeam) await clearPendingSignup(email);
  if (error && /already/i.test(error.message)) {
    const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!existing) return { error: error.message };
    const { data: had } = await admin.from("workspace_members").select("active").eq("workspace_id", workspace.id).eq("user_id", existing.id).maybeSingle();
    if (had) return { error: had.active ? "That person is already in this workspace." : "That person is in the list below: reactivate them." };
    const added = await admin.from("workspace_members").insert({ workspace_id: workspace.id, user_id: existing.id, role: p.data.role, active: true });
    if (added.error) return { error: added.error.message };
    revalidatePath("/settings");
    return { ok: true, added: true };
  }
  if (error) return { error: error.message };
  // new accounts join as editors; give them the chosen role in this workspace straight away (service role)
  if (p.data.role !== "editor" && invited.user) await admin.from("workspace_members").update({ role: p.data.role }).eq("workspace_id", workspace.id).eq("user_id", invited.user.id);
  revalidatePath("/settings");
  return { ok: true };
}

const independentSchema = z.object({
  email: z.email("Enter a valid email"),
  full_name: z.string().trim().max(120).default(""),
  workspace_name: z.string().trim().max(120).default(""),
});

/** Create an independent account with its own private workspace (the team workspace's owner only). */
export async function createIndependentAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { isTeam, isOwner } = await requireUser();
  if (!isTeam || !isOwner) return { error: "Only the owner of the Layer2Funnels workspace can create independent accounts." };
  const p = independentSchema.safeParse({ email: fd.get("email"), full_name: fd.get("full_name") ?? "", workspace_name: fd.get("workspace_name") ?? "" });
  if (!p.success) return { error: p.error.issues[0].message };
  const r = await startIndependentSignup(p.data, await siteUrl());
  if (r.exists) return { error: "That email already has an account." };
  if (r.error) return { error: r.error };
  return { ok: true };
}

/* ---------------- workspaces ---------------- */
/** Switch to another workspace you're an active member of (checked by the database). */
export async function switchWorkspaceAction(id: string) {
  const { sb } = await requireUser();
  const { error } = await sb.rpc("switch_workspace", { p_workspace: uuid.parse(id) });
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  redirect("/");
}

/** Admins create a new, empty workspace with its own data and teammates, and switch to it. */
export async function createWorkspaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const { sb } = await requireAdmin();
  const p = z.string().trim().min(1, "Name the workspace").max(120).safeParse(fd.get("name") ?? "");
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await sb.rpc("create_workspace", { p_name: p.data });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect("/");
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
  const { sb, user, canEdit } = await requireUser();
  if (!canEdit) return { error: VIEWER };
  const p = productSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, ...row } = p.data;
  const q = id ? sb.from("products").update(row).eq("id", id) : sb.from("products").insert({ ...row, owner_id: user.id });
  const { error } = await q;
  if (error) return { error: error.message };
  if (row.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true };
}

export async function deleteProductAction(id: string, clientId: string | null) {
  const { sb } = await requireEditor();
  const { error } = await sb.from("products").delete().eq("id", uuid.parse(id));
  if (error) throw new Error(error.message);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/* ---------------- import ---------------- */
/** Create a new funnel for a client from an exported .json file (this app's format or the prototype's). */
export async function importFunnelAction(clientId: string, json: string): Promise<ActionResult> {
  const { sb, user, canEdit } = await requireUser();
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
  const { data, error } = await sb
    .from("funnels")
    .insert({ client_id: clientId, owner_id: user.id, name: d.name || "Imported funnel", description: d.description ?? "", graph: graph as never, settings: d.settings as never, summary: summary(compute(graph, d.settings)) as never })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, id: data.id };
}
