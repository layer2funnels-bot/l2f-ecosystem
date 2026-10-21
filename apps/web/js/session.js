// Browser session: access + refresh token with expiry. Storage and clock are injected so this is testable without a browser.
// The token lives in localStorage (static hosting, no server session). The Content-Security-Policy (_headers) is the XSS defence.
const KEY = 'l2f.session.v1';
export function createSession({ storage, now = () => Date.now() }) {
  const read = () => { try { return JSON.parse(storage.getItem(KEY) || 'null'); } catch { return null; } };
  const write = (s) => { try { s ? storage.setItem(KEY, JSON.stringify(s)) : storage.removeItem(KEY); } catch { /* private mode: stays signed in for this tab only */ } };
  let mem = read();
  return {
    // GoTrue session body -> stored form
    set(body) {
      mem = { access: body.access_token, refresh: body.refresh_token, expiresAt: body.expires_at ? body.expires_at * 1000 : now() + (body.expires_in ?? 3600) * 1000, email: body.user?.email ?? mem?.email ?? null, userId: body.user?.id ?? mem?.userId ?? null };
      write(mem); return mem;
    },
    get: () => mem,
    clear() { mem = null; write(null); },
    signedIn: () => Boolean(mem?.access),
    // refresh when less than a minute is left (clock skew tolerant)
    needsRefresh: () => Boolean(mem && mem.expiresAt - now() < 60_000),
    expired: () => Boolean(mem && mem.expiresAt <= now()),
  };
}
// GoTrue puts tokens in the URL hash after e-mail links: #access_token=...&refresh_token=...&type=recovery
export function parseAuthHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!p.get('access_token') && !p.get('error_code')) return null;
  return { type: p.get('type'), access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in') || 3600), error: p.get('error_code') };
}
