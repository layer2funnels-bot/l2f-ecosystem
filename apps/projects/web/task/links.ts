// Helpers for task links (https only).
export function normalizeUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let s = raw.trim();
  if (!s) return { ok: false, error: 'Enter a link.' };
  if (/\s/.test(s)) return { ok: false, error: 'A link cannot contain spaces.' };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/\s:]+:\d+(\/|$)/.test(s);
  if (hasScheme) {
    if (/^http:\/\//i.test(s)) return { ok: false, error: 'Only https:// links are allowed.' };
    if (!/^https:\/\//i.test(s)) return { ok: false, error: 'Only https:// links are allowed.' };
  } else {
    s = `https://${s.replace(/^\/\//, '')}`;
  }
  if (s.length > 2000) return { ok: false, error: 'That link is too long (2000 characters at most).' };
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || !u.hostname) return { ok: false, error: 'Enter a valid link.' };
  } catch { return { ok: false, error: 'Enter a valid link.' }; }
  return { ok: true, url: s };
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
