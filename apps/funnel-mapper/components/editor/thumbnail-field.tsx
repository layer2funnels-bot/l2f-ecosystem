"use client";
// Page URL → thumbnail, with every state of the lifecycle: no preview, URL entered, capturing, saved, error + retry,
// replace / open / remove, and the semantic wireframe whenever there is no capture. Capture is display-only.
import { useState } from "react";
import { Icon } from "@/components/icon";
import { LogoUpload } from "@/components/logo-upload";
import { CATCOLOR, typeOf } from "@/lib/catalog";
import { visualOf } from "@/lib/block-visuals";
import { validateCaptureUrl } from "@/lib/capture";
import type { FunnelNode } from "@/lib/graph";
import { showToast, updateNode, useEditor } from "@/lib/editor/store";
import { WireframeStrip } from "./block-visual";
import { TextField } from "./fields";

type Phase = "idle" | "loading" | "error" | "unavailable";

export function ThumbnailField({ n }: { n: FunnelNode }) {
  const ro = useEditor((s) => s.readOnly);
  const [phase, setPhase] = useState<Phase>("idle");
  const [msg, setMsg] = useState("");
  const [more, setMore] = useState(false);
  const V = visualOf(n.type);
  const T = typeOf(n.type);
  const url = (n.url ?? "").trim();
  const check = url ? validateCaptureUrl(url) : null;

  async function capture() {
    if (!check?.ok) return;
    setPhase("loading");
    setMsg("");
    try {
      const r = await fetch("/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, nodeId: n.id }) });
      const j = (await r.json().catch(() => ({}))) as { path?: string; message?: string; error?: string };
      if (r.status === 503 || j.error === "unavailable") {
        // no capture service is configured on this deployment (CAPTURE_URL_TEMPLATE): uploading is the way to add a preview
        setPhase("unavailable");
        setMsg(j.message ?? "Automatic capture isn’t set up here.");
        setMore(true);
        return;
      }
      if (!r.ok || !j.path) {
        setPhase("error");
        setMsg(j.message ?? "The page couldn’t be captured.");
        return;
      }
      updateNode(n.id, { shot: j.path });
      setPhase("idle");
      showToast("Preview saved");
    } catch {
      setPhase("error");
      setMsg("You seem to be offline. Try again, or upload a screenshot.");
    }
  }

  return (
    <div className="field fm-thumb" aria-busy={phase === "loading"}>
      <span className="lbl">Page preview</span>
      <div className={`tn-prev${phase === "loading" ? " loading" : ""}`}>
        {V.wireframe && <WireframeStrip kind={V.wireframe} accent={CATCOLOR[T.color ?? T.cat]} shot={n.shot} />}
        {phase === "loading" && (
          <span className="tn-load" role="status">
            Capturing the page…
          </span>
        )}
      </div>
      <TextField label="Page URL" type="url" value={n.url ?? ""} placeholder="https://" onChange={(v) => updateNode(n.id, { url: v || undefined })} />
      {url && check && !check.ok && (
        <p className="help" role="alert">
          {check.reason}
        </p>
      )}
      {!ro && (
        <div className="tn-actions">
          {!n.shot && phase !== "error" && phase !== "unavailable" && (
            <button type="button" className="btn sm" disabled={!check?.ok || phase === "loading"} onClick={capture}>
              {phase === "loading" ? "Capturing…" : "Capture preview"}
            </button>
          )}
          {phase === "error" && (
            <button type="button" className="btn sm" onClick={capture}>
              Retry
            </button>
          )}
          {n.shot && (
            <>
              <button type="button" className="btn sm" disabled={!check?.ok || phase === "loading"} onClick={capture}>
                Replace capture
              </button>
              {check?.ok && (
                <a className="btn sm" href={check.url} target="_blank" rel="noopener noreferrer">
                  Open page <Icon name="link" size={13} />
                </a>
              )}
              <button type="button" className="btn sm danger" onClick={() => (updateNode(n.id, { shot: undefined }), setMsg(""), setPhase("idle"))}>
                Remove
              </button>
            </>
          )}
          <button type="button" className="btn sm ghost" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {n.shot ? "Upload a different screenshot" : "Upload instead"}
          </button>
        </div>
      )}
      {phase === "error" && (
        <p className="help" role="alert">
          {msg} The wireframe stays until a preview is saved.
        </p>
      )}
      {phase === "unavailable" && (
        <p className="help" role="status">
          {msg} Upload a screenshot instead; an admin can switch capture on by setting <code>CAPTURE_URL_TEMPLATE</code> on the server.
        </p>
      )}
      {!n.shot && !url && phase === "idle" && <p className="help">Optional. Until a preview is saved, the card shows a wireframe for this page type. Previews never change the numbers.</p>}
      {more && !ro && <LogoUpload bucket="screenshots" label="Screenshot" url={n.shot ?? null} name={`shot-${n.id}`} onChange={async (u) => updateNode(n.id, { shot: u ?? undefined })} />}
    </div>
  );
}

