// The 100 KB image rule (V2 F7), server side. Every image the app stores goes through optimiseImage() first:
// flatten transparency on white → WebP → resize to the kind's maximum width → quality 80 down to 40 until it is under
// 100 KB → if still over, narrower widths → if still over, reject with a plain message. Node only (sharp): app code
// imports it through lib/image-pipeline (server-only); the one-off re-compress script imports it directly.
import sharp, { type Metadata } from "sharp";

export const MAX_STORED_BYTES = 100 * 1024;
/** Largest upload accepted before optimising. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type ImageKind = "shot" | "logo" | "icon";
const MAX_WIDTH: Record<ImageKind, number> = { shot: 1200, logo: 512, icon: 256 };
const QUALITIES = [80, 70, 60, 50, 40];

export class ImageRejected extends Error {}

export interface Optimised {
  bytes: Buffer;
  width: number;
  height: number;
  type: "image/webp";
}

/** Narrower widths to try after the kind's maximum: 1200 → 1000 → 800 → 600 for screenshots, then halves for small kinds. */
function widthsFor(kind: ImageKind, natural: number): number[] {
  const max = Math.min(MAX_WIDTH[kind], natural);
  const steps = kind === "shot" ? [1200, 1000, 800, 600, 480, 360] : [MAX_WIDTH[kind], Math.round(MAX_WIDTH[kind] * 0.75), Math.round(MAX_WIDTH[kind] / 2)];
  return [max, ...steps.filter((w) => w < max)];
}

export async function optimiseImage(input: Buffer | Uint8Array, kind: ImageKind): Promise<Optimised> {
  if (input.byteLength > MAX_INPUT_BYTES) throw new ImageRejected("This image is over 25 MB. Choose a smaller file.");
  let meta: Metadata;
  try {
    // limitInputPixels guards against decompression bombs; first frame only for animated images
    meta = await sharp(input, { limitInputPixels: 100_000_000 }).metadata();
  } catch {
    throw new ImageRejected("This file isn’t an image we can read. Use PNG, JPG or WebP.");
  }
  if (!meta.width || !meta.height) throw new ImageRejected("This file isn’t an image we can read. Use PNG, JPG or WebP.");
  for (const width of widthsFor(kind, meta.width)) {
    for (const quality of QUALITIES) {
      const { data, info } = await sharp(input, { limitInputPixels: 100_000_000, density: meta.format === "svg" ? 144 : undefined })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ width, withoutEnlargement: true })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (data.byteLength < MAX_STORED_BYTES) return { bytes: data, width: info.width, height: info.height, type: "image/webp" };
    }
  }
  throw new ImageRejected("This image can’t be made small enough. Try a simpler image.");
}

/** "7.8 MB → 61 KB" */
export function sizeLine(before: number, after: number) {
  const f = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  return `${f(before)} → ${f(after)}`;
}

/** The picture a block shows on the map (V4): 208 x 256, top of the page, WebP under 100 KB (2x the 104 x 128 picture). */
export const PIC_SIZE = { w: 208, h: 256 } as const;
export async function optimisePicture(input: Buffer | Uint8Array): Promise<Optimised> {
  if (input.byteLength > MAX_INPUT_BYTES) throw new ImageRejected("This image is over 25 MB. Choose a smaller file.");
  for (const quality of QUALITIES) {
    let out;
    try {
      out = await sharp(input, { limitInputPixels: 100_000_000 })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ width: PIC_SIZE.w, height: PIC_SIZE.h, fit: "cover", position: "top" })
        .webp({ quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ImageRejected("This file isn’t an image we can read. Use PNG, JPG or WebP.");
    }
    if (out.data.byteLength < MAX_STORED_BYTES) return { bytes: out.data, width: out.info.width, height: out.info.height, type: "image/webp" };
  }
  throw new ImageRejected("This image can’t be made small enough. Try a simpler image.");
}
