# 03 · Permissions, data ownership and integrations

Repo baseline: `workspaces`, `workspace_members(role)`, `workspace_apps`, app-level grants (e.g. Planner grant, Projects membership), RLS on every table, `private.*` helper functions, audit log. Extend; don't replace.

## 1. Identity and relationships [N]
One **person** (auth user) can hold several **relationships**:
- `teammate` in an organization: role Owner · Admin · Editor · Viewer · custom (e.g. "Freelancer").
- `client_contact` for a client record in an organization (portal access, client apps).
A person may be a teammate and a client contact at the same time (example in prototype: Sana Noor, Editor in Layer2Funnels and client contact of Nova Yoga). The two relationships never merge: as a client she sees only her client's data; her teammate access never appears in the client experience.
Table suggestion: `relationships(id, workspace_id, user_id, kind, role_or_client_id, status, created_by, created_at)`; invitations create a relationship on accept; an existing email links to the same user (no duplicates).

## 2. Access model [N]
Effective access = organization app switch (`workspace_apps`) ∧ person's app access ∧ feature permission ∧ record-level rule (membership, ownership, privacy). **Default deny.**
1. **App access** per person per app: on/off + level Viewer / Editor / Admin. Starts from the role defaults (Roles matrix), can be overridden per person.
2. **Feature permissions** (switches inside each app). Required list (prototype `office6.js` `FEAT`):
   - Office: Funnels area (view / edit), Documents (manage sections), Admin pages.
   - Projects: create projects, **create personal projects**, archive projects, delete projects, manage members, see time & billable.
   - Planner: Strategy model, hold reviews, archive objectives, delete objectives (map to existing `planner.plan.manage`, `planner.goal.create` etc.).
   - Clients: see pricing and value, edit delivery stages, delete clients.
   - Drive: share outside the organization, delete for good, Personal space.
   - Tasks: see teammates’ tasks, assign to others.
   - Social: approve posts. Forms: publish publicly, export answers. Funnel Mapper: share funnel links. Agents: run Meeting Intelligence.
3. **Client apps**: client contacts get their own client workspace (client edition of Office: Home, their requests/approvals, notes) and by default these apps: **Projects, Tasks, Client Portal, Planner, Funnel Mapper, Forms, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents**. Each can be switched off per client (Office › Admin › Client access matrix). Inside those apps they only see records shared with their client.
4. **Who can change what**: **Owner** changes teammates and clients; **Admin** changes teammates only (client access shown read-only with "Only owners can change client access"); branding owners only. Every change → audit log.
5. Server enforcement: a `private.can(user, workspace, app, feature)` SQL function used by RLS and API guards; UI uses the same result to hide/disable (with a tooltip reason). "Check access" panel in Admin answers "Can X do Y?" with the reason (role, override, feature off, not a member).
6. **Access review** (explained in UI): every 90 days owners see access not used recently (e.g. Drive Editor unused 41 days) with Keep / Reduce / Remove. Needs `last_used_at` per app per person (update on API use, cheap).

## 3. Client records: one source of truth (Clients ↔ Funnel Mapper) [N]
- **Clients app owns client identity**: name, business, contacts, status (Lead, Proposal, Active, Paused, Past, Lost), lead, value, tags, niche, logo.
- Funnel Mapper (separate Next.js app on Supabase today) must read and create clients through a **Client service** (shared API/RPC) scoped to the org. Creating a client in Funnel Mapper calls the service → it appears in Clients; creating in Clients appears in Funnel Mapper. Duplicate check by contact email + normalized name; offer "Link to existing".
- FM keeps its own data keyed by `client_id`: funnels, client products, notes, scenarios, pricing model.
- Migration (needs Tabish's approval, non-destructive): map existing FM clients to Clients records (match by email/name, report conflicts), store `external_ref` both ways, keep FM rows until verified. Archive/delete in Clients archives in FM (no hard delete across systems).
- Internal funnels (owner = organization) vs client funnels (owner = client) stay separate in access.
- Failure handling: if the Client service is down, FM shows the last cached list read-only and queues creation with a visible "Saving to Clients…" state; never create a local-only client silently.

## 4. Files: references, not copies [N rules]
- Drive is storage. Projects (attachments, Docs & links, Collection), Clients (documents, copy), Tasks attachments **reference** Drive objects (`file_links(file_id, parent_type, parent_id)`), with the parent's access rules applied.
- **Projects › Files** lists all files linked to projects/tasks the user can open; it never copies.
- Client files are not in the shared Library (decision locked earlier); they live under the client's scope.
- **Move/Copy Library ↔ Personal**: move changes owner/scope (Library = organization owns, everyone in org can find; Personal = only you, shares to others are removed after a warning); copy creates a new file with no sharing; version history moves with a move, not with a copy. Server-side copy (no download/upload).

## 5. Saving, versions, storage [N rules]
| Type | Saving | History | Storage |
|---|---|---|---|
| Documents, Spreadsheets, Slides | Autosave (debounced ~2 s) | Every change as small ops/deltas; named versions kept forever; autosaves thinned after 30 days (daily) and 90 days (weekly) | Tiny |
| Images, PDFs | Explicit **Save** (no history list) | **Original upload + latest edit only** | ≤ one extra copy |
- **Reset to original** in Image and PDF editors: confirmation dialog, restores the original upload, discards edits, logged. The original is never modified.
- Admin › Storage shows usage by area (files, versions, projects, clients, audio), largest files, and the rules table above, plus settings "Keep named versions forever" and "Thin autosaves older than 30/90 days".

## 6. Cross-app links and events
- My day (Office Home) and Tasks › Today read: Projects tasks assigned to me, Tasks items due, Planner actions/updates due. Completing in My day updates the source app.
- Planner → Projects: "Create a project from this plan/strategy" calls a Projects endpoint `createProjectFromPlan(planId|strategyId, options)` → focus areas become sections, objectives become tasks (owner, due), link stored both ways. Planner keeps KPIs.
- Tasks → Projects: "Send to a project" moves the item and leaves a link.
- Meeting Intelligence [F] → Tasks Inbox (action items) and Drive (audio, transcript, notes).
- Notifications: every app writes through the notification service (02_GLOBAL_SHELL §6).
