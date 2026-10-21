// Auth shell screens. Neutral theme (the organization is unknown before sign-in). All need design.
import { h } from '../dom.js';
import { button, field, needsDesign } from './common.js';
import { MIN_PASSWORD, isEmail } from '../gotrue.js';
import { messageFor } from '../messages.js';

const card = (title, ...body) => h('main', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
  h('p', { class: 'brand-line' }, 'Layer2Funnels · Aurj'), h('h1', { 'data-page-title': true }, title), ...body, needsDesign()));
const link = (href, text) => h('a', { href }, text);
const errorLine = (t) => (t ? h('p', { class: 'form-error', role: 'alert' }, t) : null);

function form({ fields, submitLabel, onSubmit, footer }) {
  const err = h('div', {});
  const f = h('form', { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); err.replaceChildren();
    const data = Object.fromEntries(new FormData(f).entries());
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Please wait…';
    const msg = await onSubmit(data);
    btn.disabled = false; btn.textContent = submitLabel;
    if (msg) { err.append(errorLine(msg)); f.querySelector('[aria-invalid=true], input')?.focus(); }
  } }, ...fields, err, h('button', { type: 'submit', class: 'btn primary block' }, submitLabel), footer ?? null);
  return f;
}

export function signInView({ app, invite }) {
  return card('Sign in',
    invite ? h('p', { class: 'info' }, 'Sign in with the email address your invitation was sent to, or create an account with that same address.') : null,
    form({
      submitLabel: 'Sign in',
      fields: [field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'username', required: true }), field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'current-password', required: true })],
      onSubmit: async ({ email, password }) => {
        if (!isEmail(email) || !password) return 'Enter your email and password.';
        return app.signIn(email.trim(), password);
      },
      footer: h('p', { class: 'links' }, link('#/forgot', 'Forgot your password?'), ' · ', link('#/signup', 'Create an account')),
    }),
    window.L2F_CONFIG.googleEnabled ? h('a', { class: 'btn secondary block', href: app.googleUrl() }, 'Continue with Google') : null);
}

export function signUpView({ app, invite }) {
  return card('Create your account',
    h('p', { class: 'muted' }, invite ? 'Use the same email address your invitation was sent to.' : 'Creating an account does not give access to any workspace. An administrator invites you.'),
    form({
      submitLabel: 'Create account',
      fields: [
        field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'username', required: true }),
        field({ id: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', required: true, hint: `At least ${MIN_PASSWORD} characters.` }),
      ],
      onSubmit: async ({ email, password }) => {
        if (!isEmail(email)) return 'Enter a valid email address.';
        if (password.length < MIN_PASSWORD) return `Your password needs at least ${MIN_PASSWORD} characters.`;
        return app.signUp(email.trim(), password);
      },
      footer: h('p', { class: 'links' }, 'Already have an account? ', link('#/signin', 'Sign in')),
    }));
}

export const checkEmailView = () => card('Check your email',
  h('p', {}, 'We sent a link to confirm your address. Open it on this device, then come back and sign in.'),
  h('p', { class: 'muted' }, 'It can take a minute. Check your spam folder if it does not arrive.'), h('p', {}, link('#/signin', 'Back to sign in')));

export function forgotView({ app }) {
  return card('Reset your password',
    form({
      submitLabel: 'Send reset link',
      fields: [field({ id: 'email', label: 'Email', type: 'email', autocomplete: 'username', required: true })],
      onSubmit: async ({ email }) => (isEmail(email) ? app.recover(email.trim()) : 'Enter a valid email address.'),
      footer: h('p', { class: 'links' }, link('#/signin', 'Back to sign in')),
    }));
}
export const resetSentView = () => card('Check your email',
  h('p', {}, 'If that address has an account, a reset link is on its way.'), h('p', {}, link('#/signin', 'Back to sign in')));

export function resetView({ app }) {
  return card('Choose a new password',
    form({
      submitLabel: 'Save password',
      fields: [field({ id: 'password', label: 'New password', type: 'password', autocomplete: 'new-password', required: true, hint: `At least ${MIN_PASSWORD} characters.` })],
      onSubmit: async ({ password }) => (password.length < MIN_PASSWORD ? `Your password needs at least ${MIN_PASSWORD} characters.` : app.setNewPassword(password)),
    }));
}

export function inviteView({ app, token, signedIn }) {
  if (!token) return card('Invitation', h('p', {}, "This invitation link is incomplete. Open the link from your email again."), h('p', {}, link('#/signin', 'Sign in')));
  if (!signedIn) return card('You have been invited',
    h('p', {}, 'Sign in, or create an account, using the same email address the invitation was sent to. You will join automatically.'),
    h('p', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/signin' }, 'Sign in'), h('a', { class: 'btn secondary', href: '#/signup' }, 'Create an account')));
  return card('Joining…', h('p', { role: 'status' }, 'Checking your invitation.'));
}
export const inviteFailedView = (app) => card("This invitation can't be used",
  h('p', {}, "It may have expired, been used already, or been sent to a different email address. Check you are signed in with the address it was sent to."),
  h('p', { class: 'actions' }, button('Sign out and try another account', () => app.signOut(), 'secondary'), h('a', { class: 'btn primary', href: '#/no-org' }, 'Continue')));

export const noOrgView = (app, email) => card("You don't have access to a workspace yet",
  h('p', {}, 'Ask your admin for an invitation. Once you accept it, your workspace appears here.'),
  email ? h('p', { class: 'muted' }, `Signed in as ${email}`) : null,
  h('p', { class: 'actions' }, button('Check again', () => app.boot(), 'secondary'), button('Sign out', () => app.signOut(), 'secondary')));

export const expiredView = (app) => card('Your session has ended',
  h('p', {}, messageFor('session_expired')), h('p', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/signin', onclick: () => app.clearSessionQuietly() }, 'Sign in')));
