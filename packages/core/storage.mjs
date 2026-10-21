// File storage, PREPARED and not switched on: nothing in this repository talks to a real storage service. The module builds the storage
// paths the database accepts (migration 0014: every path starts with the organization and names the space) and signs short-lived
// upload and download addresses through an INJECTED client, so it is tested with a fake and works with Supabase Storage at go-live
// (`storage.from(bucket).createSignedUrl / createSignedUploadUrl`). It never signs a path outside the organization the caller named.

const SAFE = /[^A-Za-z0-9._ -]/g;
export const cleanFileName = (name) => {
  const base = String(name ?? '').split(/[\\/]/).pop().normalize('NFKD').replace(SAFE, '_').replace(/^[. ]+/, '').slice(0, 120).trim();
  return base || 'file';
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The folder a space's files live under (must match private.drive_path_ok in migration 0014).
export function spacePrefix({ workspaceId, space, clientId, ownerId }) {
  if (!UUID.test(workspaceId ?? '')) throw new Error('organization required');
  if (space === 'shared') return `${workspaceId}/shared/`;
  if (space === 'client') { if (!UUID.test(clientId ?? '')) throw new Error('client required'); return `${workspaceId}/clients/${clientId}/`; }
  if (space === 'personal') { if (!UUID.test(ownerId ?? '')) throw new Error('owner required'); return `${workspaceId}/personal/${ownerId}/`; }
  throw new Error('unknown space');
}
export const newObjectPath = (where, fileName, id = crypto.randomUUID()) => `${spacePrefix(where)}${id}/${cleanFileName(fileName)}`;
export const pathBelongsTo = (path, workspaceId) => typeof path === 'string' && UUID.test(workspaceId ?? '') && path.startsWith(`${workspaceId}/`) && !path.includes('..') && !path.includes('//') && path.length <= 600;

export function createStorageSigner({ storage, bucket = 'drive', maxDownloadSeconds = 300 }) {
  if (!storage?.createSignedUrl || !storage?.createSignedUploadUrl) throw new Error('a storage client is required');
  const area = (path) => (path.split('/')[1] ?? '');
  return {
    // returns where to PUT the bytes; the caller then registers the file with this path (the database re-checks the path)
    async signUpload({ workspaceId, space, clientId, ownerId, fileName }) {
      const path = newObjectPath({ workspaceId, space, clientId, ownerId }, fileName);
      const r = await storage.createSignedUploadUrl(bucket, path);
      if (r?.error || !r?.data?.signedUrl) throw new Error('storage refused');
      return { path, url: r.data.signedUrl, token: r.data.token ?? null };
    },
    async signDownload({ workspaceId, path, seconds = maxDownloadSeconds }) {
      if (!pathBelongsTo(path, workspaceId) || !['shared', 'clients', 'personal'].includes(area(path))) throw new Error('path outside this organization');
      const ttl = Math.min(Math.max(1, Math.floor(Number(seconds) || 1)), maxDownloadSeconds);
      const r = await storage.createSignedUrl(bucket, path, ttl);
      if (r?.error || !r?.data?.signedUrl) throw new Error('storage refused');
      return { url: r.data.signedUrl, expiresInSeconds: ttl };
    },
  };
}
