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
