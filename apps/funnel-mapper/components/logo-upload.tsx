"use client";
import { useRef, useState } from "react";
import { Icon } from "./icon";
import { useSignedUrl } from "./signed-image";
import { optimiseForStorage, sizeLine } from "@/lib/image-client";
import { storeShot, uploadImage } from "@/lib/eco/upload";

/**
 * Uploads an image to the organization's file storage: shrunk in the browser to WebP under 100 KB (V2 F7), then stored privately.
 * `url` and `onChange` carry the stored path; the preview uses a short-lived address signed for people allowed to see it.
 * Page captures (`bucket="screenshots"`) also store the block's 208 x 256 picture.
 */
export function LogoUpload({ url, onChange, label = "Logo", bucket = "logos" }: { url: string | null; name: string; onChange: (path: string | null) => Promise<void>; label?: string; bucket?: "logos" | "screenshots" }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isPrivate = bucket === "screenshots";
  const preview = useSignedUrl(isPrivate ? "screenshots" : "logos", url);
  const [done, setDone] = useState("");
  async function pick(f: File) {
    setErr("");
    setDone("");
    if (f.size > 25 * 1024 * 1024) return setErr(`${label} must be under 25 MB`);
    if (!(bucket === "logos" ? /^image\/(png|jpe?g|webp|svg\+xml|gif)$/ : /^image\/(png|jpe?g|webp)$/).test(f.type)) return setErr(bucket === "logos" ? "Use a PNG, JPG, WebP, SVG or GIF" : "Use a PNG, JPG or WebP");
    setBusy(true);
    try {
      if (isPrivate) {
        const r = await storeShot(f);
        await onChange(r.path);
        setDone(sizeLine(f.size, r.bytes));
      } else {
        const img = await optimiseForStorage(f, "logo");
        await onChange(await uploadImage(img, "logo"));
        setDone(sizeLine(f.size, img.size));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-bg">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${label}`} className="h-full w-full object-contain" />
        ) : (
          <Icon name="upload" className="text-muted" />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Optimising…" : url ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        </button>
        {url && (
          <button type="button" className="btn sm danger" onClick={() => onChange(null)} disabled={busy}>
            Remove
          </button>
        )}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" hidden aria-label={`Upload ${label}`} onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        {done && !err && (
          <p role="status" className="w-full text-sm text-muted">
            {done}
          </p>
        )}
        {err && (
          <p role="alert" className="w-full text-sm text-bad">
            {err}
          </p>
        )}
      </div>
    </div>
  );
}
