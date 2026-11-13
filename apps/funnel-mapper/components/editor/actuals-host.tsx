"use client";
// Where the Actual entry points land (V3 "Entering real numbers"): the banner's Enter numbers / Import CSV open the existing
// entry dialog, and the block's Actual tab saves one row for the dates on the calendar. Everything writes funnel_actuals.
import { useCallback, useEffect, useState } from "react";
import type { ActualRowDb } from "@/lib/schemas";
import { ecoCall } from "@/lib/eco/browser";
import { closeActualsEntry, setActuals, showToast, useEditor } from "@/lib/editor/store";
import { ActualsEntry } from "./actuals-entry";

/** Re-read this funnel's actuals; the map's Actual view and the strip follow. */
export async function reloadActuals(): Promise<ActualRowDb[]> {
  const s = useEditor.getState();
  const r = await ecoCall<ActualRowDb>("fmp.actuals.list", { funnel: s.funnelId });
  const data = r.ok ? r.data : null;
  if (!r.ok) {
    showToast("Couldn’t load the real numbers");
    return s.actuals ?? [];
  }
  setActuals(data ?? []);
  return data ?? [];
}

/** Save (or clear) one step's real numbers for exactly these dates. Empty values delete the row. */
export async function saveActual(nodeId: string, range: { start: string; end: string }, v: { visitors?: number | null; conversions?: number | null; revenue?: number | null; spend?: number | null }): Promise<boolean> {
  const s = useEditor.getState();
  const empty = Object.values(v).every((x) => x == null);
  const q = empty
    ? await ecoCall("fmp.actuals.save", { funnel: s.funnelId, clear: { period_start: range.start, period_end: range.end, node_ids: [nodeId] } })
    : await ecoCall("fmp.actuals.save", { funnel: s.funnelId, rows: [{ period_start: range.start, period_end: range.end, node_id: nodeId, visitors: v.visitors ?? null, conversions: v.conversions ?? null, revenue: v.revenue ?? null, spend: v.spend ?? null }] });
  if (!q.ok) {
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
