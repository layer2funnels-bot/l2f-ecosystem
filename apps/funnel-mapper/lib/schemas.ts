// Zod schemas for forms and DB rows outside the funnel graph.
import { z } from "zod";
import { BILLING_FREQUENCIES, PRICING_MODELS } from "./pricing";

export const CLIENT_STATUSES = ["lead", "proposal", "active", "paused", "past"] as const;
export const FUNNEL_STATUSES = ["draft", "proposed", "live", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];
export const STATUS_LABEL: Record<string, string> = {
  lead: "Lead",
  proposal: "Proposal",
  active: "Active",
  paused: "Paused",
  past: "Past",
  draft: "Draft",
  proposed: "Proposed",
  live: "Live",
  archived: "Archived",
};

// Record shapes as the ecosystem API returns them (stage 2; lib/eco/data.ts maps trash and storage fields to these names).
import type { EcoClient, EcoFunnel } from "./eco/data";
type J = Record<string, unknown>;
export type ClientRow = EcoClient;
export type FunnelRow = EcoFunnel & { graph: unknown };
export type ProfileRow = { id: string; full_name: string; email: string };
export type TemplateRow = { id: string; builtin_key: string | null; name: string; category: string; description: string; graph: unknown; settings: unknown; own?: boolean; created_at?: string };
export type VersionRow = { id: string; funnel_id: string; label: string; auto: boolean; created_at: string; created_by?: string | null; graph: unknown; settings: unknown };
export type ActualRowDb = { id: string; funnel_id: string; period_start: string; period_end: string; node_id: string; visitors: number | null; conversions: number | null; revenue: number | null; spend: number | null; source: string; source_ref: string | null; updated_at?: string };
export type ShareLinkRow = { id: string; funnel_id: string; can_edit: boolean; hide_numbers: boolean; allow_comments: boolean; expires_at: string | null; created_at: string; token?: string };
export type ShareCommentRow = { id: string; share_link_id: string; funnel_id: string; node_id: string | null; author_name: string; body: string; resolved: boolean; created_at: string };
export type ProductRow = { id: string; client_id: string | null; name: string; type: string; params: J; notes: string; created_at: string; updated_at: string };

const optUrl = z
  .string()
  .trim()
  .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s))
  .pipe(z.union([z.literal(""), z.url("Enter a valid website")]));

const optDate = z
  .union([z.literal(""), z.iso.date("Enter a valid date")])
  .default("")
  .transform((d) => d || null);

export const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(120),
  business_name: z.string().trim().max(160).default(""),
  niche: z.string().trim().max(80).default(""),
  email: z.union([z.literal(""), z.email("Enter a valid email")]).default(""),
  phone: z.string().trim().max(40).default(""),
  website: optUrl.default(""),
  country: z.string().trim().max(80).default(""),
  currency: z.string().default("GBP"),
  status: z.enum(CLIENT_STATUSES).default("lead"),
  monthly_retainer: z.coerce.number().min(0, "Retainer can’t be negative").default(0),
  pricing_model: z.enum(PRICING_MODELS).default("retainer"),
  pricing_amount: z.coerce.number().min(0, "Amounts can’t be negative").default(0),
  billing_frequency: z.enum(BILLING_FREQUENCIES).default("monthly"),
  hours_per_month: z.coerce.number().min(0, "Hours can’t be negative").default(0),
  commission_pct: z.coerce.number().min(0, "Commission must be between 0 and 100%").max(100, "Commission must be between 0 and 100%").default(0),
  project_start: optDate,
  project_end: optDate,
  pricing_notes: z.string().trim().max(500).default(""),
  notes: z.string().max(20000).default(""),
  tags: z
    .union([z.array(z.string()), z.string()])
    .transform((t) => (Array.isArray(t) ? t : t.split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().max(40)).max(30))
    .default([]),
});
export type ClientForm = z.output<typeof clientFormSchema>;

