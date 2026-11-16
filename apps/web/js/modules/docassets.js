// Pictures inside documents (Docs, Slides) as ATTACHMENTS (owner requirement OR-28, migration 0061): never separate Drive files, stored once per
// organization by content hash, compressed before upload, referenced by every document (and every version) that used them.
//   attach(api, fileId, blob) -> { asset, width, height } | null      url(api, fileId, assetId) -> Promise<string|null> (cached)
const MAX_SIDE = 2000, QUALITY = 0.85, TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A smaller copy for photos (JPEG/WebP, longest side ≤ 2000 px, quality 0.85); PNG and GIF keep their format (transparency, animation). */
export async function compress(blob) {
  if (!TYPES.includes(blob.type)) return null;
  if (blob.type === 'image/gif' || typeof createImageBitmap !== 'function') return { blob, w: null, h: null };
  let bmp; try { bmp = await createImageBitmap(blob); } catch { return { blob, w: null, h: null }; }
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height)); const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const keepPng = blob.type === 'image/png'; if (s === 1 && (keepPng || blob.size < 300 * 1024)) { bmp.close?.(); return { blob, w, h }; }
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const type = keepPng ? 'image/png' : 'image/webp';
  const out = await new Promise((r) => c.toBlob(r, type, QUALITY)) ?? await new Promise((r) => c.toBlob(r, 'image/jpeg', QUALITY));
  return { blob: out && out.size < blob.size ? out : blob, w, h };
}

export async function attach(api, fileId, input) {
  const c = await compress(input); if (!c) return null; const { blob } = c;
  if (blob.size > 10 * 1024 * 1024) throw new Error('That picture is over 10 MB even after compressing.');
  const sha = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const s = await api.call('drive.assets.sign', { file: fileId, sha256: sha, mime_type: blob.type, size_bytes: blob.size });
  if (!s.ok) throw new Error(s.status === 404 ? 'You can’t add pictures to this file.' : s.error?.message ?? 'The picture could not be added.');
  if (s.data[0].asset) return { asset: s.data[0].asset, width: c.w, height: c.h, reused: true };
  const put = await fetch(s.data[0].url, { method: s.data[0].method || 'PUT', headers: { 'content-type': blob.type, ...(s.data[0].headers ?? {}) }, body: blob }).then((x) => x.ok, () => false);
  if (!put) throw new Error('The upload failed. Try again.');
  const r = await api.call('drive.assets.register', { file: fileId, sha256: sha, path: s.data[0].path, mime_type: blob.type, ...(c.w ? { width: c.w, height: c.h } : {}) });
  if (!r.ok) throw new Error(r.error?.message ?? 'The picture could not be added.');
  cache.delete(r.data[0].asset);
  return { asset: r.data[0].asset, width: c.w, height: c.h, reused: false };
}

const cache = new Map();
/** A display address for an attachment of this document (signed, short-lived; refreshed after 4 minutes). */
export function url(api, fileId, assetId) {
  const hit = cache.get(assetId); if (hit && Date.now() - hit.at < 240000) return hit.p;
  const p = api.call('drive.assets.url', { file: fileId, assets: [assetId] }).then((r) => (r.ok && r.data[0] ? r.data[0].url : null));
  cache.set(assetId, { p, at: Date.now() }); return p;
}
