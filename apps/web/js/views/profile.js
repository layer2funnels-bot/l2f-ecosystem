// Your profile (every signed-in person: team members and clients): photo, name, e-mail, password. Each person changes only their own.
// The photo is cut to a small square JPEG in the browser (the API accepts at most 12,000 characters), so no file storage is involved.
import { h, put, icon, btn, field, notice, skeleton, toast, errorState, initials } from '../ui.js';
import { MIN_PASSWORD, isEmail } from '../gotrue.js';

const MAX_CHARS = 11500;
/** Square, centred crop of an image file as a small JPEG data URL (quality lowered until it fits). */
export async function shrinkPhoto(file, size = 160) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const s = Math.min(bmp.width, bmp.height); g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size); bmp.close?.();
  for (const q of [0.82, 0.7, 0.58, 0.46, 0.36, 0.28]) { const url = c.toDataURL('image/jpeg', q); if (url.length <= MAX_CHARS) return url; }
  return null;
}

export function profileView({ app, me }) {
  const root = h('section', { class: 'prof' });
  const head = h('div', { class: 'pj-head' }, h('div', {}, h('div', { class: 'crumbs fine' }, 'Account'), h('h1', { 'data-page-title': true }, 'Your profile'),
    h('p', { class: 'sub' }, 'Only you can change these. Your name and photo are shown to the people you work with.')));
  put(root, head, skeleton(3));
  (async () => {
    const r = await app.getProfile();
    if (!r.ok) return put(root, head, errorState(() => profileView({ app, me })));
    let p = r.data;
    const avatar = h('div', { class: 'prof-photo' });
    const paintAvatar = () => avatar.replaceChildren(p.photo ? h('img', { src: p.photo, alt: 'Your photo' }) : h('span', { 'aria-hidden': 'true' }, initials(p.name || p.email)));
    paintAvatar();

    // photo
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'pf-file' });
    const photoMsg = h('p', { class: 'fine', role: 'status' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0]; file.value = ''; if (!f) return;
      if (!/^image\//.test(f.type)) { photoMsg.textContent = 'Choose an image file (JPG, PNG or similar).'; return; }
      photoMsg.textContent = 'Preparing your photo…';
      let url = null; try { url = await shrinkPhoto(f); } catch { /* unreadable */ }
      if (!url) { photoMsg.textContent = 'We couldn’t read that image. Try another one.'; return; }
      const x = await app.saveProfile({ photo: url });
      if (!x.ok) { photoMsg.textContent = x.message; return; }
      p = { ...p, photo: url }; paintAvatar(); photoMsg.textContent = ''; toast('Photo saved.');
    });
    const photoCard = h('div', { class: 'panel prof-card' }, h('h2', {}, 'Photo'), h('div', { class: 'prof-row' }, avatar, h('div', { class: 'prof-acts' },
      btn('Choose a photo', () => file.click(), 'primary'),
      btn('Remove photo', async () => { const x = await app.saveProfile({ clear_photo: true }); if (!x.ok) { photoMsg.textContent = x.message; return; } p = { ...p, photo: null }; paintAvatar(); toast('Photo removed.'); }), photoMsg)), file);

    // name
    const nm = field({ id: 'pf-name', label: 'Your name', value: p.name ?? '', maxlength: 120 });
    const nameCard = h('div', { class: 'panel prof-card' }, h('h2', {}, 'Name'), nm.el, btn('Save name', async () => {
      const v = nm.input.value.trim(); if (!v) return nm.error('Enter your name.'); nm.ok?.();
      const x = await app.saveProfile({ name: v }); if (!x.ok) return nm.error(x.message);
      p = { ...p, name: v }; toast('Name saved.'); paintAvatar();
    }, 'primary'));

    // e-mail
    const em = field({ id: 'pf-email', label: 'New email address', type: 'email', value: '' });
    const emailMsg = h('p', { class: 'fine', role: 'status' });
    const emailCard = h('div', { class: 'panel prof-card' }, h('h2', {}, 'Email'), h('p', {}, 'You sign in with ', h('b', {}, p.email ?? ''), '.'), em.el, emailMsg, btn('Change email', async () => {
      const v = em.input.value.trim(); if (!isEmail(v)) return em.error('Enter an email, like name@example.com.');
      const x = await app.changeEmail(v); if (!x.ok) return em.error(x.message);
      em.input.value = ''; emailMsg.textContent = `We sent a confirmation link to ${v}. Your sign-in email changes after you open it.`;
    }, 'primary'));

    // password
    const pw1 = field({ id: 'pf-pw', label: 'New password', type: 'password', hint: `At least ${MIN_PASSWORD} characters.` }); const pw2 = field({ id: 'pf-pw2', label: 'Repeat the new password', type: 'password' });
    const code = field({ id: 'pf-code', label: 'Code from your email', autocomplete: 'one-time-code', inputmode: 'numeric' }); code.el.hidden = true;
    const pwCard = h('div', { class: 'panel prof-card' }, h('h2', {}, 'Password'), pw1.el, pw2.el, code.el, btn('Change password', async () => {
      if (pw1.input.value.length < MIN_PASSWORD) return pw1.error(`Use at least ${MIN_PASSWORD} characters.`);
      if (pw1.input.value !== pw2.input.value) return pw2.error('The two passwords don’t match.');
      const x = await app.changePassword(pw1.input.value, code.el.hidden ? undefined : code.input.value.trim() || undefined);
      if (!x.ok) { if (x.needCode) { code.el.hidden = false; return code.error(x.message); } return pw1.error(x.message); }
      pw1.input.value = pw2.input.value = code.input.value = ''; code.el.hidden = true; toast('Password changed.');
    }, 'primary'));
    const secCard = h('div', { class: 'panel prof-card' }, h('h2', {}, 'Security'), h('p', {}, 'Signed in somewhere you no longer use, or lost a device? Sign out everywhere: every browser and phone has to sign in again.'),
      btn('Sign out of all devices', () => app.signOutEverywhere()));

    put(root, head, h('div', { class: 'prof-grid' }, photoCard, nameCard, emailCard, pwCard, secCard), h('p', {}, btn('Sign out', () => app.signOut())));
  })();
  return root;
}
