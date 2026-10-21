import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ImageRejected, optimiseImage, optimisePicture, PIC_SIZE, sizeLine } from "@/lib/image-optimise";
import { picPath } from "@/lib/shot-path";

// a noisy 2400×3000 PNG with transparency: the worst case for the size rule
async function noisy(w: number, h: number) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) % 251;
  return sharp(px, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

describe("100 KB image rule", () => {
  it("screenshots come out as WebP under 100 KB, at most 1200px wide", async () => {
    const big = await noisy(2400, 3000);
    expect(big.byteLength).toBeGreaterThan(400 * 1024);
    const out = await optimiseImage(big, "shot");
    expect(out.type).toBe("image/webp");
    expect(out.bytes.byteLength).toBeLessThan(100 * 1024);
    expect(out.width).toBeLessThanOrEqual(1200);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.hasAlpha).toBe(false); // flattened on white
  }, 60000);
  it("logos are at most 512px and small images are never enlarged", async () => {
    const out = await optimiseImage(await noisy(1000, 400), "logo");
    expect(out.width).toBeLessThanOrEqual(512);
    const small = await optimiseImage(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#10b981" } }).png().toBuffer(), "logo");
    expect(small.width).toBe(64);
  }, 60000);
  it("rejects what isn't an image, in plain words", async () => {
    await expect(optimiseImage(Buffer.from("not an image"), "logo")).rejects.toBeInstanceOf(ImageRejected);
    expect(sizeLine(7.8 * 1024 * 1024, 61 * 1024)).toBe("7.8 MB → 61 KB");
  });
});

describe("block picture (208 x 256)", () => {
  it("is cropped from the top of the page, exactly 208 x 256, under 100 KB", async () => {
    const out = await optimisePicture(await noisy(1200, 4000));
    expect([out.width, out.height]).toEqual([PIC_SIZE.w, PIC_SIZE.h]);
    expect(out.bytes.byteLength).toBeLessThan(100 * 1024);
    expect((await sharp(out.bytes).metadata()).format).toBe("webp");
  }, 60000);
  it("lives next to the capture", () => {
    expect(picPath("u1/shot-n1-123.webp")).toBe("u1/shot-n1-123-pic.webp");
  });
});
