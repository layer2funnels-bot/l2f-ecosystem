// Launcher: tiles come straight from launcher_apps (what this person may open here). Needs design.
import { h } from '../dom.js';
import { chip, comingSoon, emptyState, needsDesign, pageTitle } from './common.js';
import { hrefFor } from '../routes.js';

const BUILT = new Set(['office']);   // apps that have screens in this build; the others say so plainly

export function launcherView({ apps, orgName }) {
  const tiles = apps.map((a) => {
    if (a.lifecycle === 'coming_soon') return h('li', { class: 'tile muted-tile' }, h('h2', {}, a.name), chip('Coming soon'));
    if (a.scope === 'external_product') {
      // Funnel Mapper Pro is a separate product with its own sign-in. We only link to it; nothing is shared or copied.
      return a.launch_url
        ? h('li', { class: 'tile' }, h('h2', {}, a.name), h('p', { class: 'muted' }, 'Opens in a new tab · own sign-in for now'),
          h('a', { class: 'btn secondary', href: a.launch_url, target: '_blank', rel: 'noopener noreferrer' }, 'Open ', a.name, h('span', { class: 'sr-only' }, ' (new tab)')))
        : h('li', { class: 'tile muted-tile' }, h('h2', {}, a.name), h('p', { class: 'muted' }, 'Its address has not been set yet. An owner adds it in Admin → Apps.'));
    }
    return BUILT.has(a.app_key)
      ? h('li', { class: 'tile' }, h('h2', {}, a.name), h('a', { class: 'btn primary', href: hrefFor.office() }, 'Open ', a.name))
      : h('li', { class: 'tile muted-tile' }, h('h2', {}, a.name), chip('Not built yet'), h('p', { class: 'muted' }, 'This app arrives in a later slice.'));
  });
  return h('section', {}, needsDesign(), pageTitle('Your apps', `Apps you can open in ${orgName}.`),
    apps.length ? h('ul', { class: 'tiles' }, ...tiles) : emptyState('No apps yet', 'You can open the shell, but no app is switched on for you in this organization. Ask an admin.'));
}
export const appPlaceholderView = (app, name) => h('section', {}, needsDesign(), pageTitle(name ?? app), comingSoon(name ?? 'This app'));
export const officeHomeView = (orgName) => h('section', {}, needsDesign(), pageTitle('Office', `Home for ${orgName}.`),
  h('ul', { class: 'tiles' }, h('li', { class: 'tile' }, h('h2', {}, 'Funnels'), h('p', { class: 'muted' }, 'Avatars, offers, stories and brand kits live here.'), h('a', { class: 'btn primary', href: hrefFor.funnels() }, 'Open Funnels'))));
