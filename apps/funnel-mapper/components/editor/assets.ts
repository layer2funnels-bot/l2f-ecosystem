"use client";
// Workspace assets in the browser: saved style presets and workspace blocks (table workspace_assets, RLS by workspace).
import { supabaseBrowser } from "@/lib/supabase/client";
import { nodeSchema, edgeSchema, type FunnelEdge, type FunnelNode } from "@/lib/graph";
import { cleanStyle, type NodeStyle } from "@/lib/style";
import { setActuals, setAssets, showToast, useEditor, type StylePreset, type WorkspaceBlock } from "@/lib/editor/store";
import { z } from "zod";

const blockData = z.object({ nodes: z.array(nodeSchema), edges: z.array(edgeSchema) });

export async function loadAssets() {
  if (useEditor.getState().assetsStatus !== "ready") setAssets({ assetsStatus: "loading" });
  const { data, error } = await supabaseBrowser().from("workspace_assets").select("id, kind, name, data").order("created_at");
  if (error || !data) return setAssets({ assetsStatus: "error" });
  const stylePresets: StylePreset[] = [],
    workspaceBlocks: WorkspaceBlock[] = [];
  for (const r of data) {
    if (r.kind === "style") {
      const st = cleanStyle((r.data ?? {}) as NodeStyle);
      if (st) stylePresets.push({ id: r.id, name: r.name, style: st });
    } else if (r.kind === "block") {
      const p = blockData.safeParse(r.data);
      if (p.success) workspaceBlocks.push({ id: r.id, name: r.name, nodes: p.data.nodes as unknown as FunnelNode[], edges: p.data.edges as unknown as FunnelEdge[] });
    }
  }
  setAssets({ stylePresets, workspaceBlocks, assetsStatus: "ready" });
}

export async function saveStylePreset(name: string, style: NodeStyle | undefined) {
  const st = cleanStyle({ ...style });
  if (!st) return showToast("Style something first, then save it");
  const { error } = await supabaseBrowser().from("workspace_assets").insert({ kind: "style", name: name.trim().slice(0, 60), data: st as never });
  if (error) return showToast("Couldn’t save the style");
  await loadAssets();
  showToast(`Saved “${name.trim()}” for this workspace`);
}

/** Save the selected blocks (and the connections between them) as a workspace block. Locks and layer order travel with them. */
export async function saveWorkspaceBlock(name: string) {
  const s = useEditor.getState();
  const ids = new Set(s.selNodes);
  const nodes = s.nodes.filter((n) => ids.has(n.id));
  if (!nodes.length) return showToast("Select the blocks to save first");
  const edges = s.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const { error } = await supabaseBrowser().from("workspace_assets").insert({ kind: "block", name: name.trim().slice(0, 60), data: { nodes, edges } as never });
  if (error) return showToast("Couldn’t save the workspace block");
  await loadAssets();
  showToast(`Saved “${name.trim()}” as a workspace block`);
}

/** Load this funnel's Actuals once (Trend widgets compare them with the plan). Owners and editors only: share links have none. */
export async function ensureActuals() {
  const s = useEditor.getState();
  if (s.actuals !== null || s.shared || !s.funnelId) return;
  setActuals([]);
  const { data } = await supabaseBrowser().from("funnel_actuals").select("*").eq("funnel_id", s.funnelId);
  setActuals(data ?? []);
}

export async function removeAsset(id: string) {
  const { error } = await supabaseBrowser().from("workspace_assets").delete().eq("id", id);
  if (error) return showToast("Couldn’t remove it");
  await loadAssets();
}
