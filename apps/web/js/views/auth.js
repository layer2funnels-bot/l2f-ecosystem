// Auth screens (design 02): sign in, sign up, check email, reset request, new password, accept invitation, no workspace yet, session expired.
// Before sign-in there is no organization, so the shell is neutral. Creating an account never grants access to anything by itself.
import { h, clear, icon, field, passwordField, notice, btn, link, dialog, toast, plate, roleLabel, orgMark, orgColor, orgInk } from '../ui.js';
import { MIN_PASSWORD, isEmail } from '../gotrue.js';

// Design v4 sign-in frame: the dark stage (marks, the layered stack, the promise, five app plates) beside the card.
import { orgMarkEl } from '../ui.js';
import { plateOf, loadRegistry } from '../registry.js';
const stage = () => {
  const row = h('div', { class: 'float-row' });
  loadRegistry().then((reg) => { if (!row.isConnected && !row.parentNode) return; row.replaceChildren(...['office', 'clients', 'drive', 'portal', 'planner'].map((id, i) => { const p = plateOf(reg.get(id) ?? { id }, 46, id === 'portal' ? 'locked' : 'available'); p.style.setProperty('--i', String(i)); return p; })); });
  return h('div', { class: 'auth-stage stage-screen on-stage' },
    h('div', { style: 'display:flex;align-items:center;gap:10px;font-weight:600' }, orgMarkEl({ slug: 'l2f' }, 30), orgMarkEl({ slug: 'aurj' }, 30), h('span', { style: 'margin-left:4px' }, 'Layer2Funnels + Aurj')),
    h('div', { class: 'stack-wrap', 'aria-hidden': 'true' }, h('div', { class: 'stack' }, h('div', { class: 'ly a', style: '--i:0' }), h('div', { class: 'ly b', style: '--i:1' }), h('div', { class: 'ly c', style: '--i:2' }), h('div', { class: 'ly d', style: '--i:3' }, h('span', {}, 'L2')))),
    h('div', {}, h('h2', {}, 'One sign-in. Every app.'), h('p', {}, 'Two organizations, kept completely apart. You only ever see what you’ve been invited to.'), row));
};
const wrap = (...children) => h('div', { class: 'auth real' }, stage(), h('main', { class: 'auth-side', id: 'main' }, ...children));
const card = (...c) => h('div', { class: 'auth-card panel' }, ...c);
const title = (text) => h('h1', { 'data-page-title': true }, text);
const submitBtn = (label, extra = '') => h('button', { type: 'submit', class: `btn pri full ${extra}`.trim() }, label);
const busy = (b, on, label) => { b.disabled = on; if (on) { b.dataset.l = b.textContent; clear(b).append(h('span', { class: 'spin', 'aria-hidden': 'true' }), 'Working…'); } else { b.textContent = label ?? b.dataset.l; } };
export const authState = { email: '', from: 'signup' };

export function signInView({ app, invite }) {
  const err = h('div', { id: 'form-err' });
  const em = field({ id: 'em', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const pw = passwordField({ id: 'pw', label: 'Password', autocomplete: 'current-password' });
  const go = submitBtn('Sign in');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); em.ok(); pw.ok(); clear(err);
    const email = em.input.value.trim(); const password = pw.input.value;
    if (!isEmail(email)) return em.error('Enter your email, like name@example.com.');
    if (!password) return pw.error('Enter your password.');
    busy(go, true);
    const bad = await app.signIn(email, password);
    if (bad) { busy(go, false, 'Sign in'); err.append(notice('err', 'cross', [h('b', {}, bad.title ?? 'That email and password don’t match.'), ` ${bad.body ?? 'Try again, or reset your password.'}`])); }
  } }, em.el, pw.el, h('div', { style: 'margin:calc(var(--space-2)*-1) 0 var(--space-4)' }, link('Forgot password?', () => app.go('#/forgot'))), go);
  return wrap(card(title('Sign in'), h('p', { class: 'sub' }, invite ? 'Sign in with the email your invitation was sent to.' : 'Use the email you were invited with.'), err,
    btn('Continue with Google', () => (app.googleReady() ? (location.href = app.googleUrl()) : toast('Google sign-in is set up at go-live.', false)), 'full'),
    h('div', { class: 'or' }, 'or'), form,
    h('p', { class: 'fine center', style: 'margin-top:var(--space-4)' }, 'New here? ', link('Create an account', () => app.go('#/signup')))),
  h('p', { class: 'fine center', style: 'margin-top:var(--space-4)' }, 'Signing in on its own doesn’t give you access to any organization. Membership is by invitation.'));
}

export function signUpView({ app, invite }) {
  const nm = field({ id: 'nm', label: 'Full name', autocomplete: 'name' });
  const em = field({ id: 'em', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const pw = passwordField({ id: 'pw', label: 'Password', autocomplete: 'new-password', hint: `At least ${MIN_PASSWORD} characters. A few random words works well.` });
  const err = h('div', {});
  const go = submitBtn('Create account');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); [nm, em, pw].forEach((f) => f.ok()); clear(err);
    const name = nm.input.value.trim(); const email = em.input.value.trim(); const password = pw.input.value;
    if (!name) return nm.error('Enter your name.');
    if (!isEmail(email)) return em.error('Enter your email, like name@example.com.');
    if (password.length < MIN_PASSWORD) return pw.error(`Use at least ${MIN_PASSWORD} characters.`);
    busy(go, true);
    const bad = await app.signUp(name, email, password);
    if (bad) { busy(go, false, 'Create account'); err.append(notice('err', 'cross', bad)); }
  } }, nm.el, em.el, pw.el, go);
  return wrap(card(title('Create your account'), h('p', { class: 'sub' }, 'Next we’ll email you a link to confirm it.'),
    notice('info', 'info', invite ? 'Use the email address your invitation was sent to. Creating an account doesn’t give you access on its own.' : 'Creating an account doesn’t give you access to any organization. You still need an invitation.'),
    err, form, h('p', { class: 'fine center', style: 'margin-top:var(--space-4)' }, 'Already have an account? ', link('Sign in', () => app.go('#/signin')))));
}

export function checkEmailView({ app }) {
  const reset = authState.from === 'reset';
  let cool = 30; let timer;
  const resend = h('button', { type: 'button', class: 'btn full', 'aria-disabled': 'true' });
  const paint = () => { resend.setAttribute('aria-disabled', String(cool > 0)); resend.textContent = cool > 0 ? `Resend email in ${cool}s` : 'Resend email'; };
  paint();
  timer = setInterval(() => { if (!resend.isConnected) return clearInterval(timer); if (cool > 0) { cool--; paint(); } }, 1000);
  resend.addEventListener('click', async () => {
    if (cool > 0) return;
    cool = 30; paint();
    const bad = await app.resend(authState.email, authState.from);
    toast(bad ? 'We couldn’t send it again. Try in a moment.' : 'Email sent again.', !bad);
  });
  return wrap(card(h('div', { class: 'center' }, h('div', { class: 'big' }, icon('mail')), title(reset ? 'Check your email' : 'Confirm your email'),
    h('p', { class: 'sub', style: 'margin-bottom:var(--space-4)' }, reset ? 'If an account exists for ' : 'We sent a link to ', h('b', { style: 'color:var(--ink)' }, authState.email), reset ? ', you’ll get a reset link shortly.' : '. Open it on this device to continue.'),
    h('p', { class: 'fine', style: 'margin-bottom:var(--space-4)' }, 'Can’t see it? Check spam. It can take a minute.'), resend,
    h('p', { style: 'margin-top:var(--space-3)' }, link('Use a different email', () => app.go(reset ? '#/forgot' : '#/signup'))))));
}

export function forgotView({ app }) {
  const em = field({ id: 'em', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' });
  const err = h('div', {}); const go = submitBtn('Send reset link');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); em.ok(); clear(err);
    const email = em.input.value.trim(); if (!isEmail(email)) return em.error('Enter your email, like name@example.com.');
    busy(go, true); const bad = await app.recover(email);
    if (bad) { busy(go, false, 'Send reset link'); err.append(notice('err', 'cross', bad)); }
  } }, em.el, go);
  return wrap(card(title('Reset your password'), h('p', { class: 'sub' }, 'Enter your email and we’ll send a link.'), err, form, h('p', { class: 'fine center', style: 'margin-top:var(--space-4)' }, link('Back to sign in', () => app.go('#/signin')))));
}

export function resetView({ app }) {
  const pw = passwordField({ id: 'pw', label: 'New password', autocomplete: 'new-password' });
  const pw2 = passwordField({ id: 'pw2', label: 'Confirm new password', autocomplete: 'new-password' });
  const r1 = h('div', { class: 'rule' }); const r2 = h('div', { class: 'rule' });
  const paint = () => {
    const a = pw.input.value; const b = pw2.input.value;
    [[r1, a.length >= MIN_PASSWORD, `At least ${MIN_PASSWORD} characters`], [r2, a !== '' && a === b, 'Both passwords match']].forEach(([el, ok, t]) => { el.className = `rule${ok ? ' ok' : ''}`; clear(el).append(icon(ok ? 'check' : 'cross'), t); });
  };
  paint(); pw.input.addEventListener('input', paint); pw2.input.addEventListener('input', paint);
  const body = h('div', {}); const err = h('div', {}); const go = submitBtn('Save new password');
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); pw.ok(); pw2.ok(); clear(err);
    if (pw.input.value.length < MIN_PASSWORD) return pw.error(`Use at least ${MIN_PASSWORD} characters.`);
    if (pw.input.value !== pw2.input.value) return pw2.error('The two passwords don’t match.');
    busy(go, true); const bad = await app.setNewPassword(pw.input.value);
    if (bad) { busy(go, false, 'Save new password'); err.append(notice('err', 'cross', bad)); return; }
    clear(body).append(h('div', { class: 'center' }, h('div', { class: 'big' }, icon('check')), h('h1', { 'data-page-title': true, tabindex: '-1' }, 'Password updated'),
      h('p', { class: 'sub' }, 'Use your new password next time you sign in.'), btn('Continue', () => app.continueAfterReset(), 'pri full', { id: 'continue' })));
    body.querySelector('#continue').focus();
  } }, pw.el, pw2.el, h('div', { class: 'fld', 'aria-live': 'polite' }, r1, r2), go);
  body.append(title('Choose a new password'), h('p', { class: 'sub' }, 'You’ll sign in with it next.'), err, form);
  return wrap(card(body));
}

// Invitation: shown to a signed-in person. `preview` is what invitation.preview returned (or null when it can't be used).
export function inviteView({ app, token, preview, email }) {
  if (!preview) return inviteFailedView(app);
  const org = { name: preview.org_name, slug: preview.org_slug };
  const accept = btn('Accept invitation', async (e) => { const b = e.currentTarget; busy(b, true); const bad = await app.acceptInvitation(token); if (bad) { busy(b, false, 'Accept invitation'); toast(bad, false); } }, 'pri');
  const decline = btn('Decline', () => dialog({ title: 'Decline this invitation?', body: h('p', {}, `You won’t be added to ${org.name}. An owner can send a new invitation later.`),
    actions: [{ label: 'Decline invitation', cls: 'dng', on: async () => { const bad = await app.declineInvitation(token); toast(bad ?? 'Invitation declined.', !bad); } }, { label: 'Keep it', focus: true }] }));
  return h('div', { class: 'auth real', 'data-org': org.slug === 'aurj' ? 'aurj' : 'l2f' }, stage(), h('main', { class: 'auth-side', id: 'main' }, card(
    h('div', { style: 'display:flex;gap:var(--space-3);align-items:center;margin-bottom:var(--space-4)' },
      orgMarkEl(org, 48),
      h('div', {}, h('div', { class: 'fine' }, 'Invitation'), h('h1', { 'data-page-title': true, style: 'font-size:22px' }, `Join ${org.name}`))),
    h('p', {}, `${preview.inviter_name || 'An owner'} invited you to join `, h('b', {}, org.name), preview.kind === 'client' ? ' as a client.' : [' as ', h('b', {}, `${/^[aeiou]/i.test(roleLabel(preview.role)) ? 'an' : 'a'} ${roleLabel(preview.role)}`), '.']),
    notice('info', 'info', ['Signed in as ', h('b', {}, email), `. This invitation was sent to that email. Accepting adds you to ${org.name} only.`]),
    h('div', { class: 'acts' }, accept, decline),
    h('p', { class: 'fine', style: 'margin-top:var(--space-4)' }, 'Wrong account? ', link('Sign out', () => app.signOut())))));
}
// Same words whether the invitation is expired, used, wrong or addressed to someone else.
export function inviteFailedView(app) {
  return wrap(card(h('div', { class: 'big w' }, icon('lock')), title('This invitation can’t be used'),
    h('p', { class: 'sub' }, 'It may have expired, been used already, or been sent to a different email address. Ask the person who invited you to send a new one.'),
    h('div', { class: 'acts' }, btn('Continue', () => app.dismissInvitation(), 'pri'), btn('Sign out', () => app.signOut()))));
}

export function noOrgView(app, email) {
  const status = h('p', { class: 'fine', id: 'cks', role: 'status', style: 'margin-top:var(--space-3)' });
  return wrap(card(h('div', { class: 'big w' }, icon('lock')), title('You’re signed in, but not in an organization yet'),
    h('p', { class: 'sub' }, 'Signed in as ', h('b', { style: 'color:var(--ink)' }, email ?? ''), '. Nothing is shown until someone invites you.'),
    h('ol', { style: 'margin:0 0 var(--space-4);padding-left:20px;color:var(--muted)' }, h('li', {}, 'Ask a Layer2Funnels or Aurj owner to invite this email.'), h('li', {}, 'Open the invitation link from your email.'), h('li', {}, 'Or check again below once they’ve sent it.')),
    h('div', { class: 'acts' }, btn('Check for invitations', async () => { status.textContent = 'Checking…'; const found = await app.recheck(); if (!found) status.textContent = 'No invitations yet. We checked just now.'; }, 'pri'), btn('Sign out', () => app.signOut())), status));
}

export function expiredView({ app, returnTo, email }) {
  const pw = passwordField({ id: 'pw', label: 'Password', autocomplete: 'current-password' });
  const err = h('div', {}); const go = submitBtn('Sign in and go back');
  const em = field({ id: 'em', label: 'Email', type: 'email', value: email ?? '', readonly: true });
  const form = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); pw.ok(); clear(err);
    if (!pw.input.value) return pw.error('Enter your password.');
    busy(go, true); const bad = await app.signIn(email, pw.input.value, { returnTo: returnTo?.hash });
    if (bad) { busy(go, false, 'Sign in and go back'); err.append(notice('err', 'cross', [h('b', {}, bad.title ?? 'That password doesn’t match.'), ` ${bad.body ?? ''}`])); }
  } }, em.el, pw.el, go);
  return wrap(card(h('div', { class: 'big w' }, icon('clock')), title('Your session ended'),
    h('p', { class: 'sub' }, 'For your safety you were signed out. Sign in again and we’ll take you back', returnTo?.label ? [' to ', h('b', { style: 'color:var(--ink)' }, returnTo.label), '.'] : '.'),
    notice('warn', 'warn', 'Changes you hadn’t saved may not be kept.'), err, email ? form : null,
    h('p', { class: 'fine center', style: 'margin-top:var(--space-4)' }, link(email ? 'Use a different account' : 'Sign in', () => app.useDifferentAccount()))));
}
