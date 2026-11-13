// Typed API operations: the only things the browser can ask the server to do.
// Each declares its input, its rate-limit class and whether it may run before an organization is chosen.
// The organization always comes from the x-org-id header (ctx.orgId), never from the input, so a body can
// never name a different organization than the one the database is already narrowed to.
const ROLES = ['owner', 'admin', 'editor', 'viewer'];

import { deliverInvitation } from './invite-mail.mjs';
import { defineOperation } from './define.mjs';
export { defineOperation };

import { funnelOperations } from './funnel-operations.mjs';
import { clientsOperations } from './client-operations.mjs';
import { projectsCompatOperations } from './projects-compat-operations.mjs';   // the old Projects app retired with migration 0051
import { collabOperations } from './collab-operations.mjs';
import { driveOperations } from './drive-operations.mjs';
import { plannerOperations } from './planner-operations.mjs';
import { plannerStrategyOperations } from './planner-strategy-operations.mjs';
import { shellOperations } from './shell-operations.mjs';
import { approvalsOperations } from './approvals-operations.mjs';
import { portalOperations } from './portal-operations.mjs';
import { formsOperations } from './forms-operations.mjs';
import { ladderOperations, socialOperations } from './ladder-social-operations.mjs';
import { projectsV2Operations } from './projects-v2-operations.mjs';
import { fmpOperations } from './fmp-operations.mjs';

export const operations = Object.freeze(Object.fromEntries([
  ...funnelOperations,
  ...clientsOperations,
  ...fmpOperations,
  ...projectsCompatOperations,
  ...collabOperations,
  ...driveOperations,
  ...plannerOperations,
  ...plannerStrategyOperations,
  ...shellOperations,
  ...approvalsOperations,
  ...portalOperations,
  ...formsOperations,
  ...ladderOperations,
  ...socialOperations,
  ...projectsV2Operations,
  defineOperation({ name: 'org.list', class: 'read', allowNoOrg: true, run: (q) => q('select org_id, name, slug, member_kind, role, is_active from my_organizations()') }),
  defineOperation({
    name: 'launcher.list', class: 'read', audience: 'any',
    run: (q, ctx) => q('select app_key, name, scope, launch_url, lifecycle from launcher_apps($1)', [ctx.orgId]),
  }),
  defineOperation({
    name: 'org.switch', class: 'write', allowNoOrg: true,
    input: { org: { type: 'uuid', required: true }, app: { type: 'text', required: true, max: 60 }, page: { type: 'text', max: 100 } },
    run: (q, _ctx, i) => q('select * from resolve_org_switch($1, $2, $3)', [i.org, i.app, i.page ?? null]),
  }),
  defineOperation({
    // what the caller may do here: organization-wide, and on the clients/projects where they hold it at that narrower scope only
    name: 'access.mine', class: 'read',
    run: (q) => q('select permission_key, scope, client_id, project_id from my_permissions()'),
  }),
  defineOperation({
    name: 'access.effective', class: 'read',
    input: { user: { type: 'uuid' }, client: { type: 'uuid' } },
    run: (q, ctx, i) => q('select permission_key, app_key, allowed, reason from effective_access($1, $2, $3)', [ctx.orgId, i.user ?? null, i.client ?? null]),
  }),
  defineOperation({
    name: 'invitation.create', class: 'sensitive',
    input: {
      email: { type: 'email', required: true }, kind: { type: 'enum', values: ['staff', 'client'], required: true },
      role: { type: 'enum', values: ROLES }, client: { type: 'uuid' }, apps: { type: 'list', items: 'text', max: 20, itemMax: 40 },
    },
    // creates the invitation, then e-mails it (when a mailer is configured) and records the answer; the link comes back only if no e-mail went out
    run: async (q, ctx, i) => {
      const [{ token }] = await q('select create_invitation($1,$2,$3,$4,$5,$6) as token', [ctx.orgId, i.email, i.kind, i.role ?? null, i.client ?? null, i.apps ?? null]);
      const [{ id }] = await q("select id from invitations where token_hash = encode(sha256(convert_to($1, 'UTF8')), 'hex')", [token]);
      const mail = await deliverInvitation(q, ctx, id, token);
      return [{ invitation_id: id, ...mail, token: mail.email_status === 'sent' ? null : token }];
    },
  }),
  defineOperation({
    name: 'invitation.accept', class: 'sensitive', allowNoOrg: true,
    input: { token: { type: 'text', required: true, max: 200 } },
    run: (q, _ctx, i) => q('select accept_invitation($1) as membership_id', [i.token]),
  }),
].map((o) => [o.name, o])));
