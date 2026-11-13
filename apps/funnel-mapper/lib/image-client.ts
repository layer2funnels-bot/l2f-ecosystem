// The 100 KB image rule (V2 F7) in the browser, for images kept inside the funnel itself (canvas image elements, as
// data URLs) and the portfolio snapshot: WebP, quality 0.8 down to 0.4, then narrower, else a plain refusal.
export const MAX_STORED_BYTES = 100 * 1024;

const dataUrlBytes = (u: string) => Math.ceil(((u.length - u.indexOf(",") - 1) * 3) / 4);

/** Draw `img` at most `maxWidth` wide and encode it as a WebP data URL under 100 KB, or throw a plain message. */
export function encodeUnder(img: CanvasImageSource & { width: number; height: number }, maxWidth: number, widths = [maxWidth, 1000, 800, 600, 400]): string {
  const c = document.createElement("canvas");
  for (const w of [...new Set(widths.filter((w) => w <= maxWidth))]) {
    const k = Math.min(1, w / img.width);
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
      const url = c.toDataURL("image/webp", q);
      if (dataUrlBytes(url) < MAX_STORED_BYTES) return url;
    }
    if (img.width <= w) break;
  }
  throw new Error("This image can’t be made small enough. Try a simpler image.");
}

export function dataUrlToBlob(u: string): Blob {
  const [head, body] = u.split(",");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type: head.slice(5).split(";")[0] });
}

/** Decodes an image file in the browser (PNG, JPG, WebP, GIF first frame, SVG), or throws a plain message. */
async function decode(f: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (f.size > 25 * 1024 * 1024) throw new Error("This image is over 25 MB. Choose a smaller file.");
  if (f.type !== "image/svg+xml") {
    try {
      return await createImageBitmap(f);
    } catch {
      /* fall through to <img> */
    }
  }
  const src = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    await img.decode();
    // an SVG without a size draws at 300 x 150; give it a sensible one
    if (!img.naturalWidth) img.width = 512;
    return Object.assign(img, { width: img.naturalWidth || 512, height: img.naturalHeight || 512 });
  } catch {
    throw new Error("This file isn’t an image we can read. Use PNG, JPG or WebP.");
  } finally {
    setTimeout(() => URL.revokeObjectURL(src), 0);
  }
}

const MAX_W = { shot: 1200, logo: 512, thumb: 1200 } as const;

/**
 * The 100 KB rule (V2 F7) for images that go to file storage, done in the browser (the server no longer re-encodes images,
 * which keeps the app small enough for Cloudflare's free plan): WebP on white, at most 1200px (page captures) or 512px (logos) wide.
 */
export async function optimiseForStorage(f: Blob, kind: keyof typeof MAX_W): Promise<Blob> {
  const img = await decode(f);
  const max = Math.min(MAX_W[kind], img.width);
  const steps = kind === "logo" ? [max, 384, 256] : [max, 1000, 800, 600, 480, 360];
  const c = document.createElement("canvas");
  for (const w of [...new Set(steps.filter((w) => w <= max))]) {
    const k = Math.min(1, w / img.width);
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.8, 0.7, 0.6, 0.5, 0.4]) {
      const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", q));
      if (b && b.size < MAX_STORED_BYTES) return b;
    }
  }
  throw new Error("This image can’t be made small enough. Try a simpler image.");
}

/** The picture a block shows on the map (V4): 208 x 256, cropped from the top of the page, WebP under 100 KB. */
export async function pictureForBlock(f: Blob): Promise<Blob> {
  const img = await decode(f);
  const W = 208,
    H = 256;
  const k = Math.max(W / img.width, H / img.height);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - img.width * k) / 2, 0, img.width * k, img.height * k);
  for (const q of [0.8, 0.6, 0.4]) {
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, "image/webp", q));
    if (b && b.size < MAX_STORED_BYTES) return b;
  }
  throw new Error("This image can’t be made small enough. Try a simpler image.");
}

/** "7.8 MB → 61 KB" */
export function sizeLine(before: number, after: number) {
  const f = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return `${f(before)} → ${f(after)}`;
}
