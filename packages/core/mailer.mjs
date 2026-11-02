// Transactional e-mail for invitations (server side only; the key never reaches a browser).
// Provider: Brevo (free plan: 300 e-mails a day). Configured by secrets on the API (Cloudflare Pages, Production and Preview):
//   BREVO_API_KEY       Brevo > SMTP & API > API keys (an "API key", not the SMTP key)
//   MAIL_FROM_EMAIL     a sender address verified in Brevo (Senders, domains & dedicated IPs)
//   MAIL_FROM_NAME      optional, default "Layer2Funnels"
//   MAIL_API_URL        optional, for tests only (a fake server); default https://api.brevo.com
// Without the first two the mailer reports 'not_configured' and nothing is sent; the admin then gets the link to pass on.
// We only say "sent" when Brevo answered 201 with a message id.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mailerFromEnv(env, fetchImpl = (...a) => fetch(...a)) {
  const key = env?.BREVO_API_KEY, from = env?.MAIL_FROM_EMAIL;
  if (!key || !from) return { configured: false, async send() { return { status: 'not_configured', error: 'not_configured' }; } };
  const base = (env.MAIL_API_URL || 'https://api.brevo.com').replace(/\/$/, '');
  const fromName = env.MAIL_FROM_NAME || 'Layer2Funnels';
  return {
    configured: true, provider: 'brevo', from,
    async send({ to, subject, html, text, tag }) {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : null;
      try {
        const r = await fetchImpl(`${base}/v3/smtp/email`, {
          method: 'POST', signal: ctl?.signal,
          headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ sender: { name: fromName, email: from }, to: [{ email: to }], subject, htmlContent: html, textContent: text, tags: tag ? [tag] : undefined }),
        });
        let body = null; try { body = await r.json(); } catch { /* empty */ }
        if (r.status === 201 && body?.messageId) return { status: 'sent', messageId: String(body.messageId).slice(0, 200) };
        // only the provider's short code is kept (never the key, never the message)
        return { status: 'failed', error: `http_${r.status}${body?.code ? `_${String(body.code).slice(0, 40)}` : ''}` };
      } catch (e) {
        return { status: 'failed', error: e?.name === 'AbortError' ? 'timeout' : 'network' };
      } finally { if (timer) clearTimeout(timer); }
    },
  };
}

const ROLE = { owner: 'Owner', admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
/** The invitation e-mail: who invites, to which organization, as what, the link, and what happens next. Plain, branded, no images. */
export function invitationEmail({ link, orgName, inviterName, kind, role, email, expiresAt }) {
  const as = kind === 'client' ? 'as a client' : `as ${/^[aeiou]/i.test(ROLE[role] ?? '') ? 'an' : 'a'} ${ROLE[role] ?? 'team member'}`;
  const until = expiresAt ? new Date(expiresAt).toUTCString().slice(0, 16) : 'in 7 days';
  const subject = `${inviterName} invited you to ${orgName}`;
  const text = [`${inviterName} invited you to join ${orgName} ${as}.`, '', `Accept the invitation: ${link}`, '',
    `1. Open the link.`, `2. Create your account with this address (${email}), or sign in if you already have one.`, `3. Confirm your e-mail if asked. You are then taken straight in.`, '',
    `The link works only for ${email} and until ${until}. If you were not expecting this, you can ignore this e-mail.`, '', 'Layer2Funnels'].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:Arial,Helvetica,sans-serif;color:#16171b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6f7380">Layer2Funnels</td></tr>
<tr><td style="padding-top:12px;font-size:24px;font-weight:bold;line-height:1.25">You're invited to ${esc(orgName)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.55">${esc(inviterName)} invited you to join <b>${esc(orgName)}</b> ${esc(as)}.</td></tr>
<tr><td style="padding:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#a82462;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:12px">Accept the invitation</a></td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#3d4049">1. Open the link.<br>2. Create your account with <b>${esc(email)}</b>, or sign in if you already have one.<br>3. Confirm your e-mail if asked. You are then taken straight in.</td></tr>
<tr><td style="padding-top:20px;font-size:12.5px;line-height:1.5;color:#6f7380">The link works only for ${esc(email)} and until ${esc(until)}. If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${esc(link)}</span><br><br>If you were not expecting this, you can ignore this e-mail.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
