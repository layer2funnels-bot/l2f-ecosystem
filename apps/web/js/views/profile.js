// Your profile (V8 02 §7): one page for every signed-in person (team members and clients), shared across apps and organizations.
// Header with cover, 112 px photo (change-photo dialog with zoom), name, roles in each organization, "My work in Office".
// Tabs: Profile (#/profile/about) · Account & sign-in · Notifications · Appearance. Each person changes only their own.
// The photo is cut to a small square JPEG in the browser (the API accepts at most 12,000 characters), so no file storage is involved.
import { h, put, icon, btn, field, skeleton, toast, errorState, initials, dialog, notice, orgMarkEl, seg } from '../ui.js';
import { MIN_PASSWORD, isEmail } from '../gotrue.js';
import { plateOf } from '../registry.js';

const MAX_CHARS = 11500;
/** Square crop of an image file as a small JPEG data URL (quality lowered until it fits). zoom 1 = the largest centred square; 3 = a third of it. */
export async function shrinkPhoto(file, size = 160, zoom = 1) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const s = Math.min(bmp.width, bmp.height) / Math.min(Math.max(zoom, 1), 3);
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size); bmp.close?.();
  for (const q of [0.82, 0.7, 0.58, 0.46, 0.36, 0.28]) { const url = c.toDataURL('image/jpeg', q); if (url.length <= MAX_CHARS) return url; }
  return null;
}

export const PROFILE_TABS = [['about', 'Profile'], ['account', 'Account & sign-in'], ['notifications', 'Notifications'], ['appearance', 'Appearance']];
const ROLE = { owner: 'Owner', admin: 'Admin', editor: 'Editor', member: 'Member', viewer: 'Viewer', commenter: 'Commenter', contact: 'Client contact' };
const roleName = (r) => ROLE[r] ?? (r ? r[0].toUpperCase() + r.slice(1) : 'Member');
const kindName = (k) => (k === 'client' ? 'client' : 'teammate');
// apps that send notices (V8 02 §6 table); shown when switched on for the person in this organization
const NOTIFY_APPS = ['projects', 'clients', 'planner', 'drive', 'social_planner', 'forms', 'portal', 'whiteboard', 'value_ladder', 'office', 'layer2_agents'];

function timeZones() {
  try { return Intl.supportedValuesOf('timeZone'); } catch { return ['UTC', 'Asia/Karachi', 'Asia/Dubai', 'Europe/London', 'America/New_York']; }
}
const here = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };

/**
 * @param {object} o
 * @param {object} o.app  appApi (getProfile, saveProfile, getProfileDetails, saveProfileDetails, notificationPrefs, setNotificationPref, changeEmail, changePassword, signOut, signOutEverywhere)
 * @param {string} [o.tab] about | account | notifications | appearance
 * @param {Array} [o.orgs] the person's organizations (org.list)
 * @param {object} [o.active] the current organization, if any
 * @param {Array} [o.catalog] apps in the current organization (launcher.catalog)
 */
export function profileView({ app, me, tab = 'about', orgs = [], active = null, catalog = [], registry = null, theme = null }) {
  if (!PROFILE_TABS.some(([k]) => k === tab)) tab = 'about';
  const root = h('section', { class: 'prof pf8' });
  root.__focused = { title: 'Your profile', sub: 'Shared across every app and both organizations', back: '#/launcher' };   // V8 focused layout (shell.js)
  const title = h('h1', { 'data-page-title': true, class: 'sr' }, 'Your profile');
  put(root, title, skeleton(3));
  (async () => {
    const [r, d] = await Promise.all([app.getProfile(), app.getProfileDetails?.() ?? { ok: true, data: {} }]);
    if (!r.ok) return put(root, title, errorState(() => root.replaceWith(profileView({ app, me, tab, orgs, active, catalog, registry, theme }))));
    let p = r.data; const det = d.ok ? (d.data ?? {}) : {};

    // ---- header: cover, photo, name, roles
    const avatar = h('span', { class: 'pf8-photo' });
    const paintAvatar = () => avatar.replaceChildren(p.photo ? h('img', { src: p.photo, alt: '' }) : h('span', { 'aria-hidden': 'true' }, initials(p.name || p.email)));
    paintAvatar();
    const nameEl = h('h2', { class: 'pf8-name' }, p.name || p.email || 'Your profile');
    const roles = orgs.map((o) => `${roleName(o.role)} · ${o.name}`).join('  ·  ');
    const staffHere = active && active.member_kind !== 'client';
    const head = h('header', { class: 'pf8-head' }, h('div', { class: 'pf8-cover', 'aria-hidden': 'true' }),
      h('div', { class: 'pf8-row' },
        h('div', { class: 'pf8-ph' }, avatar, h('button', { type: 'button', class: 'pf8-cam', 'aria-label': 'Change photo', title: 'Change photo', onclick: () => photoDialog() }, icon('imgI'))),
        h('div', { class: 'pf8-who' }, nameEl, roles ? h('p', { class: 'pf8-roles' }, roles) : null),
        staffHere ? h('a', { class: 'btn ghost sm pf8-work', href: '#/office/team' }, plateOf(registry?.get('office') ?? { id: 'office' }, 20), 'My work in Office') : null));

    const photoDialog = () => {
      const input = h('input', { type: 'file', accept: 'image/*', class: 'sr', id: 'pf-file' });
      const prev = h('div', { class: 'pf8-prev' }, p.photo ? h('img', { src: p.photo, alt: 'Your current photo' }) : h('span', { 'aria-hidden': 'true' }, initials(p.name || p.email)));
      const zoom = h('input', { type: 'range', min: '1', max: '3', step: '0.05', value: '1', id: 'pf-zoom', disabled: true });
      const msg = h('p', { class: 'fine', role: 'status' });
      let file = null; let url = null;
      const paint = () => { if (!url) return; const img = prev.querySelector('img') ?? prev.appendChild(h('img', { alt: 'Your new photo' })); prev.replaceChildren(img); img.src = url; img.style.transform = `scale(${zoom.value})`; };
      input.addEventListener('change', () => {
        const f = input.files?.[0]; input.value = ''; if (!f) return;
        if (!/^image\//.test(f.type)) { msg.textContent = 'Choose an image file (JPG, PNG or similar).'; return; }
        const rd = new FileReader();   // a data: address for the preview (the security policy allows no blob: images)
        rd.onload = () => { file = f; url = String(rd.result); zoom.disabled = false; zoom.value = '1'; msg.textContent = ''; paint(); };
        rd.onerror = () => { msg.textContent = 'We couldn’t read that image. Try another one.'; };
        rd.readAsDataURL(f);
      });
      zoom.addEventListener('input', paint);
      const body = h('div', { class: 'pf8-dlg' }, prev,
        h('div', { class: 'fld' }, h('label', { for: 'pf-zoom' }, 'Zoom'), zoom),
        h('div', { class: 'prof-acts' }, h('label', { class: 'btn', for: 'pf-file' }, icon('upload'), 'Choose a photo'), input,
          p.photo ? btn('Remove photo', async () => { const x = await app.saveProfile({ clear_photo: true }); if (!x.ok) { msg.textContent = x.message; return; } p = { ...p, photo: null }; paintAvatar(); close(); toast('Photo removed.'); }) : null),
        msg);
      const close = dialog({ title: 'Profile photo', body, key: 'profile-photo', actions: [
        { label: 'Cancel' },
        { label: 'Save photo', cls: 'primary', on: async () => {
          if (!file) { msg.textContent = 'Choose a photo first.'; return false; }
          msg.textContent = 'Preparing your photo…';
          let data = null; try { data = await shrinkPhoto(file, 160, Number(zoom.value)); } catch { /* unreadable */ }
          if (!data) { msg.textContent = 'We couldn’t read that image. Try another one.'; return false; }
          const x = await app.saveProfile({ photo: data }); if (!x.ok) { msg.textContent = x.message; return false; }
          p = { ...p, photo: data }; paintAvatar(); toast('Photo saved.'); return true;
        } },
      ] });
    };

    // ---- tabs (real links: each tab has its own address)
    const tabs = h('nav', { class: 'pf8-tabs', 'aria-label': 'Profile sections' }, ...PROFILE_TABS.map(([k, label]) =>
      h('a', { href: `#/profile/${k}`, ...(k === tab ? { 'aria-current': 'page' } : {}) }, label)));
    const pane = h('div', { class: 'pf8-pane' });

    if (tab === 'about') {
      const full = field({ id: 'pf-full', label: 'Full name', value: det.full_name ?? '', maxlength: 120, autocomplete: 'name' });
      const nm = field({ id: 'pf-name', label: 'Display name', value: p.name ?? '', maxlength: 120, autocomplete: 'nickname' });
      const job = field({ id: 'pf-job', label: 'Job title', value: det.job_title ?? '', maxlength: 80, autocomplete: 'organization-title' });
      const zones = timeZones(); const curZone = det.time_zone ?? '';
      const tz = field({ id: 'pf-tz', label: 'Time zone', value: curZone, options: [['', `Not set (this device: ${here()})`], ...zones.map((z) => [z, z.replace(/_/g, ' ')])] });
      const about = field({ id: 'pf-about', label: 'About', value: det.about ?? '', rows: 2, maxlength: 600 });
      const save = btn('Save', async () => {
        const v = nm.input.value.trim(); if (!v) return nm.error('Enter the name people will see.'); nm.ok();
        save.disabled = true;
        const [a, b] = await Promise.all([
          v !== p.name ? app.saveProfile({ name: v }) : { ok: true },
          app.saveProfileDetails({ full_name: full.input.value.trim(), job_title: job.input.value.trim(), time_zone: tz.input.value, about: about.input.value.trim() }),
        ]);
        save.disabled = false;
        if (!a.ok) return nm.error(a.message);
        if (!b.ok) { toast(b.message, false); return; }
        p = { ...p, name: v }; nameEl.textContent = v; paintAvatar(); toast('Profile saved.');
      }, 'primary');
      const form = h('div', { class: 'panel pf8-card' }, h('div', { class: 'pf8-two' }, full.el, nm.el, job.el, tz.el), about.el, h('div', {}, save));
      const orgCard = h('aside', { class: 'panel pf8-card pf8-orgs', 'aria-labelledby': 'pf-orgs-t' }, h('h3', { id: 'pf-orgs-t', class: 'pf8-cap' }, 'Your organizations'),
        orgs.length ? h('ul', {}, ...orgs.map((o) => h('li', {}, orgMarkEl(o, 40),
          h('div', {}, h('b', {}, o.name), h('small', {}, `${roleName(o.role)} · ${kindName(o.member_kind)}`))))) : h('p', { class: 'fine' }, 'You aren’t in an organization yet.'),
        h('p', { class: 'fine' }, 'One sign-in. Each organization keeps its own data and your role in it.'));
      pane.append(h('div', { class: 'pf8-split' }, form, orgCard));
    }

    if (tab === 'account') {
      const em = field({ id: 'pf-email', label: 'New email address', type: 'email', value: '', autocomplete: 'email' });
      const emailMsg = h('p', { class: 'fine', role: 'status' });
      const emailCard = h('div', { class: 'panel pf8-card' }, h('h3', {}, 'Email'), h('p', {}, 'You sign in with ', h('b', {}, p.email ?? ''), '.'), em.el, emailMsg, h('div', {}, btn('Change email', async () => {
        const v = em.input.value.trim(); if (!isEmail(v)) return em.error('Enter an email, like name@example.com.');
        const x = await app.changeEmail(v); if (!x.ok) return em.error(x.message);
        em.input.value = ''; emailMsg.textContent = `We sent a confirmation link to ${v}. Your sign-in email changes after you open it.`;
      }, 'primary')));
      const pw1 = field({ id: 'pf-pw', label: 'New password', type: 'password', hint: `At least ${MIN_PASSWORD} characters.`, autocomplete: 'new-password' }); const pw2 = field({ id: 'pf-pw2', label: 'Repeat the new password', type: 'password', autocomplete: 'new-password' });
      const code = field({ id: 'pf-code', label: 'Code from your email', autocomplete: 'one-time-code', inputmode: 'numeric' }); code.el.hidden = true;
      const pwCard = h('div', { class: 'panel pf8-card' }, h('h3', {}, 'Password'), pw1.el, pw2.el, code.el, h('div', {}, btn('Change password', async () => {
        if (pw1.input.value.length < MIN_PASSWORD) return pw1.error(`Use at least ${MIN_PASSWORD} characters.`);
        if (pw1.input.value !== pw2.input.value) return pw2.error('The two passwords don’t match.');
        const x = await app.changePassword(pw1.input.value, code.el.hidden ? undefined : code.input.value.trim() || undefined);
        if (!x.ok) { if (x.needCode) { code.el.hidden = false; return code.error(x.message); } return pw1.error(x.message); }
        pw1.input.value = pw2.input.value = code.input.value = ''; code.el.hidden = true; toast('Password changed.');
      }, 'primary')));
      const google = h('div', { class: 'panel pf8-card' }, h('h3', {}, 'Google sign-in'), h('p', { class: 'fine' }, 'Turns on at go-live. Until then you sign in with your email and password.'));
      const secCard = h('div', { class: 'panel pf8-card' }, h('h3', {}, 'Signed-in devices'),
        h('p', {}, 'Signed in somewhere you no longer use, or lost a device? Sign out everywhere: every browser and phone, including this one, has to sign in again.'),
        h('div', { class: 'prof-acts' }, btn('Sign out of all devices', () => app.signOutEverywhere()), btn('Sign out', () => app.signOut())));
      pane.append(h('div', { class: 'pf8-grid' }, emailCard, pwCard, google, secCard));
    }

    if (tab === 'notifications') {
      if (!active) pane.append(notice('info', 'info', 'Join or open an organization to choose its notifications.'));
      else if (active.member_kind === 'client') pane.append(notice('info', 'info', `In ${active.name} you’re a client contact. The team keeps you up to date in the Client Portal.`));
      else {
        const intro = h('p', { class: 'pf8-intro' }, `Notifications from every app arrive in one inbox, the bell on the left. Choose what reaches you in ${active.name}.`);
        const apps = NOTIFY_APPS.map((k) => catalog.find((a) => a.app_key === k && a.state === 'available')).filter(Boolean);
        const table = h('div', { class: 'pf8-ntab', role: 'status', 'aria-busy': 'true' }, skeleton(2));
        pane.append(intro, table, h('p', { class: 'fine' }, 'Email needs an approved provider, so email digests aren’t sent yet. Mentions and approvals can’t be turned off.'));
        const pr = await app.notificationPrefs();
        if (!pr.ok) { table.replaceWith(errorState(() => root.replaceWith(profileView({ app, me, tab, orgs, active, catalog, registry, theme })))); }
        else {
          const off = new Set(pr.data.filter((x) => !x.in_app).map((x) => x.app));
          const row = (a) => {
            const sw = h('button', { type: 'button', role: 'switch', class: 'toggle', 'aria-checked': String(!off.has(a.app_key)), 'aria-label': `${a.name}: notifications in the inbox` });
            sw.addEventListener('click', async () => {
              const on = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(on)); sw.disabled = true;
              const x = await app.setNotificationPref(a.app_key, on); sw.disabled = false;
              if (!x.ok) { sw.setAttribute('aria-checked', String(!on)); toast(x.message, false); return; }
              toast(on ? `${a.name} notifications on.` : `${a.name} notifications off. Mentions and approvals still arrive.`);
            });
            return h('tr', {}, h('th', { scope: 'row' }, h('span', { class: 'pf8-app' }, plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 24), a.name)),
              h('td', {}, h('span', { class: 'pf8-sw' }, sw)), h('td', { class: 'muted' }, 'Not yet'), h('td', {}, 'Always'), h('td', {}, 'Always'));
          };
          table.removeAttribute('role'); table.removeAttribute('aria-busy');
          table.replaceChildren(apps.length ? h('table', {}, h('thead', {}, h('tr', {}, ...['App', 'In-app inbox', 'Email digest', 'Mentions', 'Approvals'].map((t) => h('th', { scope: 'col' }, t)))), h('tbody', {}, ...apps.map(row)))
            : h('p', { class: 'fine pf8-pad' }, 'No app that sends notifications is switched on for you here.'));
        }
      }
    }

    if (tab === 'appearance') {
      // the shared segmented control (ui.js seg, V8 .vsw): one pressed button
      const themeSeg = seg([['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], theme?.pref?.() ?? 'system', (v) => { theme?.set(v); toast(`Theme: ${{ system: 'follows your device', light: 'light', dark: 'dark' }[v]}.`); }, 'Theme');
      const sw = (label, hint, get, set, id) => {
        const b = h('button', { type: 'button', role: 'switch', class: 'toggle', id, 'aria-checked': String(!!get()), 'aria-describedby': `${id}-h` });
        b.addEventListener('click', () => { const on = b.getAttribute('aria-checked') !== 'true'; set(on); b.setAttribute('aria-checked', String(on)); });
        return h('div', { class: 'tg-row pf8-tg' }, h('div', {}, h('label', { for: id }, label), h('small', { id: `${id}-h` }, hint)), b);
      };
      pane.append(h('div', { class: 'panel pf8-card pf8-narrow' },
        h('h3', {}, 'Theme'), themeSeg,
        h('h3', { style: 'margin-top:16px' }, 'Text size'), seg([['standard', 'Standard'], ['large', 'Large'], ['larger', 'Larger']], theme?.textSize?.() ?? 'large', (v) => { theme?.setTextSize?.(v); toast(`Text size: ${v}.`); }, 'Text size'),
        h('p', { class: 'fine' }, 'Large is the default. Standard matches the design exactly; Larger is easier to read on small or distant screens.'),
        sw('Reduce motion', 'Turns off animations everywhere, including the Launcher weather. Your device setting also does this.', () => theme?.reduceMotion?.(), (v) => theme?.setReduceMotion?.(v), 'pf-motion'),
        sw('Compact density', 'Tighter spacing, so more fits on the screen. Buttons stay easy to tap.', () => theme?.compact?.(), (v) => theme?.setCompact?.(v), 'pf-density'),
        h('p', { class: 'fine' }, 'The Launcher sky follows the time of day and the weather in your area by itself. These settings are saved on this device.')));
    }

    put(root, title, head, tabs, pane);
  })();
  return root;
}
