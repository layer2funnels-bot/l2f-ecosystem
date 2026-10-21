"use client";
import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { selectNodes, setMode, useEditor } from "@/lib/editor/store";

/** Select a block and zoom the map to it (health checks, key leak, drop-off bars). Leaves Reports for the Map first. */
export function useFocusBlock() {
  const rf = useReactFlow();
  return useCallback(
    (id: string) => {
      const wasReports = useEditor.getState().mode === "reports";
      setMode("map");
      selectNodes([id]);
      // the canvas is laid out again when it comes back from Reports: zoom after it has had a frame
      const go = () => rf.fitView({ nodes: [{ id }], padding: 1.6, duration: 350, maxZoom: 1.2 });
      if (wasReports) requestAnimationFrame(() => requestAnimationFrame(go));
      else go();
    },
    [rf],
  );
}
