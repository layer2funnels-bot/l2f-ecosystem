// Zod schemas for forms and DB rows outside the funnel graph.
import { z } from "zod";
import type { Database } from "./supabase/database.types";
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

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type FunnelRow = Database["public"]["Tables"]["funnels"]["Row"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type TemplateRow = Database["public"]["Tables"]["templates"]["Row"];
export type VersionRow = Database["public"]["Tables"]["funnel_versions"]["Row"];
export type ActualRowDb = Database["public"]["Tables"]["funnel_actuals"]["Row"];
export type ShareLinkRow = Database["public"]["Tables"]["share_links"]["Row"];
export type ShareCommentRow = Database["public"]["Tables"]["share_comments"]["Row"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];

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

