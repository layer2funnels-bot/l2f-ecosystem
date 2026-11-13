// Browser session: access + refresh token with expiry. Storage and clock are injected so this is testable without a browser.
// The token lives in one cookie every ecosystem app on the domain reads (sharedSessionStore below; earlier: localStorage). It is readable by the
// page's own scripts, as before, so the Content-Security-Policy (_headers) stays the XSS defence.
const KEY = 'l2f.session.v1';
export function createSession({ storage, now = () => Date.now() }) {
  const read = () => { try { return JSON.parse(storage.getItem(KEY) || 'null'); } catch { return null; } };
  // memOnly: storage refused the write (private mode, cookies off): this tab keeps the session in memory only
  let memOnly = false;
  const write = (s) => { try { s ? storage.setItem(KEY, JSON.stringify(s)) : storage.removeItem(KEY); memOnly = false; } catch { memOnly = true; } };
  let mem = read();
  return {
    // GoTrue session body -> stored form
    set(body) {
      mem = { access: body.access_token, refresh: body.refresh_token, expiresAt: body.expires_at ? body.expires_at * 1000 : now() + (body.expires_in ?? 3600) * 1000, email: body.user?.email ?? mem?.email ?? null, userId: body.user?.id ?? mem?.userId ?? null, name: body.user?.user_metadata?.full_name ?? mem?.name ?? null };
      write(mem); return mem;
    },
    // read from storage every time: another app on the same domain (Funnel Mapper) may have renewed the shared session, and renewing
    // with an old refresh token would make the sign-in service end the session everywhere
    get: () => (memOnly ? mem : (mem = read())),
    clear() { mem = null; write(null); },
    signedIn() { return Boolean(this.get()?.access); },
    // refresh when less than a minute is left (clock skew tolerant)
    needsRefresh() { const m = this.get(); return Boolean(m && m.expiresAt - now() < 60_000); },
    expired() { const m = this.get(); return Boolean(m && m.expiresAt <= now()); },
  };
}
// GoTrue puts tokens in the URL hash after e-mail links: #access_token=...&refresh_token=...&type=recovery
export function parseAuthHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!p.get('access_token') && !p.get('error_code')) return null;
  return { type: p.get('type'), access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in') || 3600), error: p.get('error_code') };
}

// ---- one sign-in for every app on the domain (owner, 13 Nov 2026)
// The session is kept in ONE cookie that every ecosystem app on the same domain reads (Funnel Mapper runs as its own app). Other browser
// data stays in local storage. `domain` comes from config.js (e.g. ".example.com" when apps sit on sub-domains; empty = this host only).
export const SESSION_COOKIE = 'l2f-session';
export function sharedSessionStore({ fallback, doc = globalThis.document, domain = '', secure = globalThis.location?.protocol === 'https:', maxAgeDays = 30 }) {
  const attrs = `; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}${secure ? '; Secure' : ''}`;
  const readCookie = () => { const m = String(doc?.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`)); return m ? decodeURIComponent(m.slice(SESSION_COOKIE.length + 1)) : null; };
  const setCookie = (v, maxAge) => { doc.cookie = `${SESSION_COOKIE}=${v}${attrs}; Max-Age=${maxAge}`; };
  // a session saved by an earlier version (local storage) moves to the shared cookie once, so nobody is signed out by the change
  try { const old = fallback.getItem(KEY); if (old && !readCookie()) { setCookie(encodeURIComponent(old), maxAgeDays * 86400); } if (old) fallback.removeItem(KEY); } catch { /* nothing to move */ }
  return {
    getItem: (k) => (k === KEY ? readCookie() : fallback.getItem(k)),
    setItem: (k, v) => {
      if (k !== KEY) return fallback.setItem(k, v);
      const enc = encodeURIComponent(v);
      if (enc.length > 3900) throw new Error('session too large for a cookie');
      setCookie(enc, maxAgeDays * 86400);
      if (readCookie() !== v) throw new Error('cookies are off');
    },
    removeItem: (k) => (k === KEY ? setCookie('', 0) : fallback.removeItem(k)),
  };
}

/** After sign-in, go back to the ecosystem app that sent the person here, only if its address is one of the configured app origins. */
export function safeAppReturn(url, allowedOrigins = []) {
  try { const u = new URL(url); return (u.protocol === 'https:' || u.protocol === 'http:') && allowedOrigins.includes(u.origin) ? u.toString() : null; } catch { return null; }
}
