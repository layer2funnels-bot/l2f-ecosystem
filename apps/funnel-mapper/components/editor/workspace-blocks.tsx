"use client";
// Workspace blocks: groups of blocks saved from any funnel, ready to place again (table workspace_assets).
import { useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { insertSnippet, useEditor } from "@/lib/editor/store";
import { loadAssets, removeAsset, saveWorkspaceBlock } from "./assets";

export function WorkspaceBlocks() {
  const list = useEditor((s) => s.workspaceBlocks);
  const status = useEditor((s) => s.assetsStatus);
  const ro = useEditor((s) => s.readOnly);
  const selCount = useEditor((s) => s.selNodes.length);
  const rf = useReactFlow();
  const [name, setName] = useState("");
  const place = (i: number) => {
    const box = document.querySelector(".fm-stage")?.getBoundingClientRect();
    const at = box ? rf.screenToFlowPosition({ x: box.left + box.width / 2 - 100, y: box.top + box.height / 3 }) : { x: 120, y: 120 };
    insertSnippet(list[i], at.x, at.y);
  };
  return (
    <div className="fm-wsblocks">
      {!ro && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !selCount) return;
            saveWorkspaceBlock(name);
            setName("");
          }}
        >
          <h2>Save the selection</h2>
          <input id="fm-wsb-name" className="input" aria-label="Name for the workspace block" placeholder={selCount ? `Name these ${selCount} ${selCount === 1 ? "block" : "blocks"}` : "Select blocks on the map first"} maxLength={60} disabled={!selCount} value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn sm primary" disabled={!selCount || !name.trim()}>
            Save as workspace block
          </button>
        </form>
      )}
      <h2>Saved in this workspace</h2>
      {status === "loading" && list.length === 0 ? (
        <p className="hint" role="status" aria-live="polite">
          Loading saved blocks…
        </p>
      ) : status === "error" && list.length === 0 ? (
        <p className="hint" role="alert">
          Couldn’t load the saved blocks.{" "}
          <button type="button" className="link" onClick={() => loadAssets()}>
            Try again
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className="hint">Nothing saved yet. Select a few blocks, name them above, and they’ll be here for every funnel in this workspace.</p>
      ) : (
        <ul>
          {list.map((b, i) => (
            <li key={b.id}>
              <button type="button" className="main" disabled={ro} onClick={() => place(i)} title="Place on the map">
                <Icon name="layers" size={14} />
                <span className="nm">{b.name}</span>
                <small>{b.nodes.length} blocks</small>
              </button>
              {!ro && (
                <button type="button" className="rm" aria-label={`Remove ${b.name}`} title={`Remove ${b.name}`} onClick={() => removeAsset(b.id)}>
                  <Icon name="trash" size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
