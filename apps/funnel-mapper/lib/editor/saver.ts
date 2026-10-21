"use client";
// Autosave: debounced (1 s) save of the editor content, with a local draft kept in localStorage whenever the
// latest change hasn't reached the server (offline, error, tab closed mid-save). Syncs when the network returns.
import { useEffect, useRef } from "react";
import { compute, summary } from "../funnel-math";
import { parseGraph, parseSettings, type FunnelGraph, type FunnelSettings } from "../graph";
import { editorSnapshot, setSaveStatus, showToast, useEditor } from "./store";

export interface SavePayload {
  name: string;
  graph: FunnelGraph;
  settings: FunnelSettings;
  summary: ReturnType<typeof summary>;
}
export type SaveFn = (p: SavePayload) => Promise<void>;
export type VersionFn = (p: SavePayload) => Promise<void>;

const draftKey = (id: string) => `fm-draft:${id}`;
const AUTO_VERSION_MS = 10 * 60 * 1000;

export interface LocalDraft {
  name: string;
  graph: FunnelGraph;
  settings: FunnelSettings;
  at: number;
}

export function readDraft(id: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { name: String(d.name ?? ""), graph: parseGraph(d.graph), settings: parseSettings(d.settings), at: Number(d.at) || 0 };
  } catch {
    return null;
  }
}
function writeDraft(id: string) {
  try {
    localStorage.setItem(draftKey(id), JSON.stringify({ ...editorSnapshot(), at: Date.now() }));
  } catch {}
}
export function clearDraft(id: string) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {}
}

function payload(): SavePayload {
  const s = editorSnapshot();
  return { ...s, summary: summary(compute(s.graph, s.settings)) };
}

/**
 * Watches the editor store and saves. `lastVersionAt` is the newest version's timestamp (ms) so automatic
 * snapshots happen at most every 10 minutes while editing.
 */
export function useAutosave({ funnelId, save, saveVersion, lastVersionAt, enabled = true }: { funnelId: string; save: SaveFn; saveVersion?: VersionFn; lastVersionAt?: number; enabled?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inflight = useRef(false);
  const again = useRef(false);
  const savedRev = useRef({ rev: 0, view: 0 });
  const lastVersion = useRef(lastVersionAt ?? 0);
  const contentSinceVersion = useRef(false);
  const fns = useRef({ save, saveVersion });
  useEffect(() => {
    fns.current = { save, saveVersion };
  });

  useEffect(() => {
    if (!enabled || !funnelId) return;
    let alive = true;
    const flush = async () => {
      clearTimeout(timer.current);
      if (inflight.current) {
        again.current = true;
        return;
      }
      const s = useEditor.getState();
      if (s.readOnly) return;
      const target = { rev: s.rev, view: s.viewRev };
      if (target.rev === savedRev.current.rev && target.view === savedRev.current.view) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        writeDraft(funnelId);
        setSaveStatus("offline");
        return;
      }
      inflight.current = true;
      setSaveStatus("saving");
      const p = payload();
      try {
        await fns.current.save(p);
        if (!alive) return;
        if (target.rev !== savedRev.current.rev) contentSinceVersion.current = true;
        savedRev.current = target;
        const now = useEditor.getState();
        if (now.rev === target.rev && now.viewRev === target.view) {
          clearDraft(funnelId);
          setSaveStatus("saved");
        }
        if (fns.current.saveVersion && contentSinceVersion.current && Date.now() - lastVersion.current >= AUTO_VERSION_MS) {
          lastVersion.current = Date.now();
          contentSinceVersion.current = false;
          fns.current.saveVersion(p).catch(() => {});
        }
      } catch {
        if (!alive) return;
        writeDraft(funnelId);
        setSaveStatus(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        // retry later
        timer.current = setTimeout(flush, 5000);
      } finally {
        inflight.current = false;
        if (again.current) {
          again.current = false;
          timer.current = setTimeout(flush, 300);
        }
      }
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.rev === prev.rev && s.viewRev === prev.viewRev) return;
      if (s.rev !== prev.rev) writeDraft(funnelId);
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, s.rev !== prev.rev ? 1000 : 2000);
    });
    const online = () => {
      if (useEditor.getState().saveStatus === "offline" || useEditor.getState().saveStatus === "error") {
        showToast("Back online. Syncing…");
        flush();
      }
    };
    const offline = () => {
      if (useEditor.getState().saveStatus !== "saved") setSaveStatus("offline");
    };
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const st = useEditor.getState().saveStatus;
      if (st === "dirty" || st === "saving" || st === "offline" || st === "error") {
        writeDraft(funnelId);
        e.preventDefault();
      }
    };
    // changes made before autosave started (e.g. a recovered local draft) are saved straight away
    if (useEditor.getState().rev !== savedRev.current.rev) timer.current = setTimeout(flush, 300);
    const retry = () => void flush(); // the chip's Retry button
    window.addEventListener("fm-save-retry", retry);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      alive = false;
      unsub();
      clearTimeout(timer.current);
      window.removeEventListener("fm-save-retry", retry);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", beforeUnload);
      // last-chance save when leaving the editor in-app
      const s = useEditor.getState();
      if (s.rev !== savedRev.current.rev || s.viewRev !== savedRev.current.view) {
        writeDraft(funnelId);
        fns.current
          .save(payload())
          .then(() => clearDraft(funnelId))
          .catch(() => {});
      }
    };
  }, [funnelId, enabled]);
}
