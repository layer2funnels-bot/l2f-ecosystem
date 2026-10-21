import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { TemplateOption } from "@/components/new-funnel-dialog";
import { TEMPLATES13 } from "./templates13";

type SB = SupabaseClient<Database>;

/** Options for the "Start from" picker: the 13 approved built-in templates + the workspace's saved templates. */
export async function templateOptions(sb: SB, savedLabel = "Team templates"): Promise<TemplateOption[]> {
  const { data } = await sb.from("templates").select("id, name, builtin_key, owner_id, category").not("owner_id", "is", null).order("created_at");
  return [
    ...TEMPLATES13.map((t) => ({ value: `builtin:${t.key}`, label: `${t.n}. ${t.name}`, group: "Built-in templates" })),
    ...(data ?? []).map((t) => ({ value: `template:${t.id}`, label: t.name, group: savedLabel })),
  ];
}
