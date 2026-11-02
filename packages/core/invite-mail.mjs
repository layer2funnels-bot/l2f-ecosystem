// Sends an invitation e-mail through the configured mailer and records what the provider answered (inside the same request).
// The raw token only travels inside the link in the e-mail (and back to the admin when no e-mail went out, so they can pass it on).
import { invitationEmail } from './mailer.mjs';

export const inviteLink = (origin, token) => `${(origin || 'https://l2f-ecosystem.pages.dev').replace(/\/$/, '')}/#/invite?token=${encodeURIComponent(token)}`;

export async function deliverInvitation(q, ctx, invitationId, token) {
  const m = ctx.mailer;
  if (!m?.configured) {
    await q('select invitation_delivery_record($1, $2, $3, $4, $5)', [invitationId, 'not_configured', null, null, 'not_configured']);
    return { email_status: 'not_configured', email_error: null };
  }
  const [f] = await q('select email, kind, role, org_name, inviter_name, expires_at from invitation_mail_facts($1)', [invitationId]);
  const mail = invitationEmail({ link: inviteLink(ctx.origin, token), orgName: f.org_name, inviterName: f.inviter_name, kind: f.kind, role: f.role, email: f.email, expiresAt: f.expires_at });
  const r = await m.send({ to: f.email, ...mail, tag: `invite_${f.kind}` });
  await q('select invitation_delivery_record($1, $2, $3, $4, $5)', [invitationId, r.status, m.provider ?? null, r.messageId ?? null, r.error ?? null]);
  return { email_status: r.status, email_error: r.error ?? null };
}
