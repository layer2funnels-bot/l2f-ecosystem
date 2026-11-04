// Folder passwords: a salted PBKDF2-SHA-256 hash (WebCrypto, so it runs in Node and in Workers; Workers allow at most 100,000 iterations).
// Stored as "pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>". The password itself is never stored or logged.
const ITER = 100000;
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITER}$${b64(salt)}$${b64(await derive(password, salt, ITER))}`;
}
export async function verifyPassword(password, stored) {
  const [alg, it, salt, hash] = String(stored ?? '').split('$'); const iterations = Number(it);
  if (alg !== 'pbkdf2-sha256' || !salt || !hash || !(iterations >= 1000 && iterations <= 1000000)) return false;
  const got = await derive(String(password ?? ''), unb64(salt), iterations); const want = unb64(hash);
  let diff = got.length ^ want.length; for (let i = 0; i < got.length; i += 1) diff |= got[i] ^ (want[i] ?? 0);   // constant time
  return diff === 0;
}
