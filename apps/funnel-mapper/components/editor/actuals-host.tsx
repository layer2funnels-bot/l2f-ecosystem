"use client";
// Where the Actual entry points land (V3 "Entering real numbers"): the banner's Enter numbers / Import CSV open the existing
// entry dialog, and the block's Actual tab saves one row for the dates on the calendar. Everything writes funnel_actuals.
import { useCallback, useEffect, useState } from "react";
import type { ActualRowDb } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/client";
import { closeActualsEntry, setActuals, showToast, useEditor } from "@/lib/editor/store";
import { ActualsEntry } from "./actuals-entry";

/** Re-read this funnel's actuals; the map's Actual view and the strip follow. */
export async function reloadActuals(): Promise<ActualRowDb[]> {
  const s = useEditor.getState();
  const { data, error } = await supabaseBrowser().from("funnel_actuals").select("*").eq("funnel_id", s.funnelId).order("period_start", { ascending: false });
  if (error) {
    showToast("Couldn’t load the real numbers");
    return s.actuals ?? [];
  }
  setActuals(data ?? []);
  return data ?? [];
}

/** Save (or clear) one step's real numbers for exactly these dates. Empty values delete the row. */
export async function saveActual(nodeId: string, range: { start: string; end: string }, v: { visitors?: number | null; conversions?: number | null; revenue?: number | null; spend?: number | null }): Promise<boolean> {
  const s = useEditor.getState();
  const sb = supabaseBrowser();
  const empty = Object.values(v).every((x) => x == null);
  const q = empty
    ? await sb.from("funnel_actuals").delete().eq("funnel_id", s.funnelId).eq("period_start", range.start).eq("period_end", range.end).eq("node_id", nodeId)
    : await sb.from("funnel_actuals").upsert({ funnel_id: s.funnelId, period_start: range.start, period_end: range.end, node_id: nodeId, visitors: v.visitors ?? null, conversions: v.conversions ?? null, revenue: v.revenue ?? null, spend: v.spend ?? null }, { onConflict: "funnel_id,period_start,period_end,node_id" });
  if (q.error) {
    showToast("Couldn’t save that number");
    return false;
  }
  await reloadActuals();
  return true;
}

export function ActualsHost() {
  const tab = useEditor((s) => s.actualsEntry);
  const rows = useEditor((s) => s.actuals);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!tab) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading external data when the dialog opens
    setReady(false);
    reloadActuals().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [tab]);
  const saved = useCallback(() => void reloadActuals(), []);
  if (!tab || !ready) return null;
  return <ActualsEntry key={tab} initialTab={tab} rows={rows ?? []} onSaved={saved} onClose={closeActualsEntry} />;
}
