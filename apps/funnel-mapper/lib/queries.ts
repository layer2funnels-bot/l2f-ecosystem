import "server-only";
import type { TemplateOption } from "@/components/new-funnel-dialog";
import { listTemplates } from "./eco/data";
import { TEMPLATES13 } from "./templates13";

/** Options for the "Start from" picker: the 13 approved built-in templates + the organization's saved templates. */
export async function templateOptions(savedLabel = "Team templates"): Promise<TemplateOption[]> {
  const own = await listTemplates(true).catch(() => []);
  return [
    ...TEMPLATES13.map((t) => ({ value: `builtin:${t.key}`, label: `${t.n}. ${t.name}`, group: "Built-in templates" })),
    ...own.map((t) => ({ value: `template:${t.id}`, label: t.name, group: savedLabel })),
  ];
}
