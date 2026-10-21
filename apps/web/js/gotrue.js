// Minimal Supabase Auth (GoTrue) client over fetch. No third-party library; no privileged key ever reaches the browser.
export function createAuthClient({ baseUrl, publishableKey, fetchImpl = (...a) => fetch(...a), redirectTo }) {
  const url = (p) => `${baseUrl.replace(/\/$/, '')}/auth/v1${p}`;
  const call = async (path, { method = 'POST', body, token } = {}) => {
    let r;
    try {
      r = await fetchImpl(url(path), { method, headers: { apikey: publishableKey, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { return { ok: false, offline: true }; }
    let data = null; try { data = await r.json(); } catch { /* empty body */ }
    return { ok: r.ok, status: r.status, data };
  };
  const rt = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  return {
    signIn: (email, password) => call('/token?grant_type=password', { body: { email, password } }),
    // with "confirm email" on, data.access_token is absent and the person must open the e-mail link first
    signUp: (email, password, name) => call(`/signup${rt}`, { body: { email, password, ...(name ? { data: { full_name: name } } : {}) } }),
    resend: (email) => call(`/resend${rt}`, { body: { type: 'signup', email } }),
    refresh: (refresh_token) => call('/token?grant_type=refresh_token', { body: { refresh_token } }),
    recover: (email) => call(`/recover${rt}`, { body: { email } }),
    setPassword: (token, password) => call('/user', { method: 'PUT', token, body: { password } }),
    signOut: (token) => call('/logout', { token }),
    googleUrl: () => `${url('/authorize')}?provider=google${redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : ''}`,
  };
}
export const MIN_PASSWORD = 10;
export const isEmail = (v) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(v);
