// What each app shows in the side rail (Design v4 §5): the app plate and name, then its pages as links. The items are the app's real routes;
// nothing here invents a page. Office reads its pages from routes.js (the same list the bottom bar uses).
import { OFFICE_PAGES, officeSection, hrefFor } from './routes.js';

const ICON = { home: 'home', planner: 'planner', projects: 'projects', funnels: 'funnels', documents: 'doc', team: 'team', apps: 'apps', admin: 'shield' };
const SHORT = { Documents: 'Docs', 'My Work': 'My Work' };

/** Which app a route belongs to (null on the Launcher and on screens outside any app). */
export function appIdFor(route, inOffice) {
  if (inOffice) return 'office';
  switch (route.name) {
    case 'doc': case 'sheet': case 'drive': return 'drive';
    case 'board': case 'boards': return 'whiteboard';
    case 'projects': return 'projects'; case 'clients': return 'clients'; case 'portal': return 'portal'; case 'forms': return 'forms';
    case 'ladder': return 'value_ladder'; case 'social': return 'social_planner';
    case 'app': return route.params.app;
    default: return null;
  }
}

/** { items: [{ key, href, label, short, icon }], current } for the side rail and the bottom bar. */
export function appNav(appId, route, { isAdmin = false } = {}) {
  const it = (key, href, label, icon) => ({ key, href, label, icon, short: SHORT[label] ?? label });
  switch (appId) {
    case 'office': {
      const FK = [['home', hrefFor.funnels(), 'Funnels home', 'home'], ['avatars', hrefFor.list('avatars'), 'Customer Avatars', 'avatar'], ['offers', hrefFor.list('offers'), 'Offers & Products', 'offer'], ['stories', hrefFor.list('stories'), 'Stories', 'story'],
        ['brand_kits', hrefFor.list('brand_kits'), 'Brand Kit', 'brand'], ['strategies', '#/office/funnels/strategies', 'Funnel Strategies', 'strategy']];
      const kid = route.name === 'funnels' ? 'home' : ['funnel-list', 'funnel-record'].includes(route.name) ? route.params.type : ['strategies', 'strategy'].includes(route.name) ? 'strategies' : null;
      return { items: OFFICE_PAGES.filter((p) => !p.adminOnly || isAdmin).map((p) => ({ ...it(p.key, p.href, p.label, ICON[p.key] ?? p.icon), ...(p.key === 'funnels' ? { kids: FK.map(([k, href, label, ic]) => ({ key: k, href, label, icon: ic })), kid } : {}) })), current: officeSection(route) };
    }
    case 'projects':
      return { items: [it('home', '#/projects', 'Home', 'home'), it('mine', '#/projects/mine', 'My Work', 'mywork'), it('all', '#/projects/all', 'Projects', 'projects'), it('docs', '#/projects/docs', 'Docs', 'doc'),
        it('whiteboards', '#/whiteboards', 'Whiteboards', 'whiteboard'), it('dashboards', '#/projects/dashboards', 'Dashboards', 'chart'), it('ai', '#/projects/ai', 'AI Assist', 'star2'), it('apps', '#/office/apps', 'App Center', 'plug')],
        current: ['mine', 'all', 'docs', 'dashboards', 'ai'].includes(route.params?.view) ? route.params.view : 'home' };
    case 'clients':
      return { items: [it('list', '#/clients', 'Clients', 'clients'), it('requests', '#/clients/requests', 'Requests & Approvals', 'inbox'), it('sops', '#/clients/sops', 'SOPs', 'sop'), it('tools', '#/clients/tools', 'Tools', 'tool'), ...(isAdmin ? [it('settings', '#/clients/settings', 'Settings', 'gear')] : [])],
        current: ['requests', 'sops', 'tools', 'settings'].includes(route.params?.view) ? route.params.view : 'list' };
    case 'drive': {
      const v = route.params?.view; const space = route.params?.space;
      return { items: [it('files', '#/drive', 'Library', 'folder'), it('personal', '#/drive/personal', 'Personal', 'drive'), it('recent', '#/drive/recent', 'Recent', 'clock'), it('trash', '#/drive/trash', 'Trash', 'trash')],
        current: v === 'recent' ? 'recent' : v === 'trash' ? 'trash' : space === 'personal' ? 'personal' : 'files' };
    }
    case 'forms':
      return { items: [it('list', '#/forms', 'Forms', 'forms'), it('submissions', '#/forms/submissions', 'Submissions', 'inbox'), it('templates', '#/forms/templates', 'Templates', 'copy')], current: route.params?.view === 'templates' ? 'templates' : route.params?.view === 'submissions' ? 'submissions' : 'list' };
    case 'value_ladder':
      return { items: [it('list', '#/ladder', 'Ladders', 'ladder2')], current: 'list' };
    case 'whiteboard':
      return { items: [it('boards', '#/whiteboards', 'All boards', 'whiteboard'), it('templates', '#/whiteboards?view=templates', 'Templates', 'copy')], current: route.query?.view === 'templates' ? 'templates' : 'boards' };
    case 'social_planner':
      return { items: [it('calendar', '#/social', 'Calendar', 'cal'), it('posts', '#/social?tab=posts', 'Posts', 'note'), it('queue', '#/social?tab=queue', 'Queue', 'list'), it('approvals', '#/social?tab=approvals', 'Approvals', 'check'), it('campaigns', '#/social?tab=campaigns', 'Campaigns', 'flag'), it('channels', '#/social?tab=channels', 'Channels', 'plug')],
        current: route.params?.view === 'c' ? 'campaigns' : (['posts', 'queue', 'approvals', 'campaigns', 'channels'].includes(route.query?.tab) ? route.query.tab : 'calendar') };
    case 'portal':
      return { items: [it('home', '#/portal', 'Preview', 'portal')], current: 'home' };
    default:
      return { items: [], current: null };
  }
}
export { hrefFor };
