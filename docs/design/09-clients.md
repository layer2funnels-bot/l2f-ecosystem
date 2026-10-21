# 09 · Clients app

**Status: REVISED REQUIREMENTS — awaiting owner review. Not approved for visual design or implementation.**

> **Source of truth:** Use this entire Markdown file as the authoritative specification for the Clients application. The existing `09-clients.html` is an incomplete early prototype only. It is not the complete application design and must not be used as the source of truth. If it conflicts with this file, follow this Markdown file. Claude Design should create a new, complete design from this specification; Claude Code must not implement the UI until the owner explicitly approves the new design.

## 1. Purpose and application-wide scope

These requirements describe the **Clients application as a whole**, including the clients list, all client records, shared navigation, Requests & Approvals, SOPs, Tools, Settings, forms, Strategy workspaces, Copy workflow, Documents, permissions, and all responsive/error/empty states. They are not a request to change only one client record.

The application must support multiple clients. Features and workflows described here are available throughout the app where the user's role permits. **Data is still isolated per client:** each client's answers, Strategy records, Brand Kit, copy, requests, approvals, notes and files belong only to that client and must never be mixed with another client's data.

Product boundaries:
- This is an internal team application. The Client Portal is not available until its separate security/go-live gate is approved.
- Never imply that a client can currently see portal content. Until the Portal is approved and enabled, do not expose content, send invitations, or claim client-facing messages have been sent.
- Client-app files belong to the relevant client inside this app. They must not automatically appear in the main shared Drive. The curated shared Drive and its protected SOPs are separate.
- Build is for tracking progress only. Actual funnel implementation happens in the client's ClickFunnels or GoHighLevel account.
- Marketing remains a placeholder until the owner defines its workflow.
- Do not implement AI-agent behavior as part of this work unless separately approved.
- Do not change live application code, database records, permissions, deployments, authentication, DNS, storage configuration, or paid services as part of this documentation/design task.

## 2. Source materials and related designs

Read and apply:
- `docs/design/06-funnels.md` for the documented Office → Funnels patterns: Customer Avatars, Offers & Products, Stories and Brand Kits.
- Approved shared shell patterns in Design 01 and `docs/design/10-shell-patterns.md`.
- The owner's handwritten Design 09 notes supplied with this project.
- Existing Layer2Funnels Copy-stage requirements from earlier project work. Claude Code/Design must locate those requirements and use them rather than inventing replacements.

The HTML file `09-clients.html` is an incomplete prototype, not an authoritative or complete design. It can be consulted only to understand what was previously explored. Do not copy its layout or assume it contains all required screens or states.

## 3. Main navigation and shared shell

Main navigation must have separate destinations:
1. **Clients**
2. **Requests & Approvals**
3. **SOPs**
4. **Tools**
5. **Settings** — Owner and Admin only

Do not combine SOPs and Tools into one item. Use the approved shared application header and organization switcher from Design 01. Use the approved mobile bottom-navigation pattern from Design 10. Pipeline is a view within Clients, not a top-level destination.

## 4. Clients list

- Heading: “Clients”; supporting text: “Everyone you're delivering for.”
- “New client” appears only for authorized roles (Owner, Admin, Editor, subject to the effective permission catalog).
- Search and filters: Show (Open / Closed / Archived / All; default Open), Stage and Account lead.
- Preserve three views: **Table · Grid · Pipeline**.
- Table columns: Client (name and business), Status, Account lead, Stage, Next action and due date, Open requests.
- Grid cards: initial/avatar, name, business, status, account lead, stage progress, next action and open-request count. Provide an accessible text alternative for stage progress.
- Pipeline columns: Brand Base → Strategy → Copy → Build → Marketing, with counts. On phones, use a stage selector and one column.
- Status values currently documented: Intake, Onboarding, Active, Paused, Closed, Archived. Do not silently change existing stored statuses or stage data; any mapping/migration requires a separate plan and approval.
- First-use empty state: “No clients yet” and a creation action only if permitted. Filtered empty state: “No matches” with a clear-filters action.

## 5. Create client

Use a responsive dialog or in-app form with:
- Client name (required)
- Business
- Main contact name
- Contact email
- Account lead

Explain that the client starts in Brand Base and nothing is shared with the client by default. On creation, open that client's Overview. Enforce permissions server-side, not only by hiding UI controls.

## 6. Client record shell and tabs

Header: client initial/avatar, name, business, account lead, status, current stage and scoped-access indicator where relevant.

Actions:
- **Manage client sharing** — preferred label instead of the unclear “Share with client”.
- **Edit details**
- **Archive**
- For archived clients: **Restore** and **Delete permanently**, only for roles permitted by the existing permission catalog.

Tabs:
1. **Overview**
2. **Work**
3. **Requests & Approvals**
4. **Documents**
5. **Team Notes**

Do not call the Documents tab “Documents & Brand Kit”. The Brand Kit belongs inside Strategy, not Documents.

## 7. Overview

Design an improved overview that helps the team quickly understand client status and the next useful action. Include:
- Delivery journey: Signed plus five stages, with completed/current/upcoming states.
- Next action: owner, due date and action to open the relevant step.
- Waiting on the client.
- Updates for the client, with a **Post update** action. Clearly state that Portal visibility is unavailable until approved and enabled.
- Needs attention.
- Latest decision.
- Team assignment.
- Recent activity, team-only.

Avoid duplicating all stage details here. Make client status and the next action easy to scan.

## 8. Work: stages and workspaces

Show the five stages: **Brand Base, Strategy, Copy, Build and Marketing**. These are application-wide workflow stages, while each client's work and records remain scoped to that individual client. Show stage progress, owners, status and due dates where appropriate.

### 8.1 Brand Base

- Show **all answers submitted by the client** in Brand Base forms, organized by section and question, within that client's record.
- Team members must be able to read submitted answers in a clear view without reopening the form builder.
- Allow authorized team members to create additional forms/questions using the existing form-builder technology.
- The form builder must work **inside the Clients application**. Creating/editing a form must not redirect the user to a separate application. Provide clear save, cancel and return behavior.
- Allow the team to prepare/send an additional information form using the Requests & Approvals workflow. While the Portal is locked, explain that it is prepared/saved and not visible to the client.
- **Do not create the Brand Kit in Brand Base.** For now, the client supplies their Brand Kit and the team records/uploads it under that client's Strategy workspace. A future agent-generated Brand Kit is only a possible future feature, not a current requirement.

### 8.2 Strategy

Strategy must reuse the structure and record concepts of the existing Office → Funnels app, scoped to the current client. Do not replace this with a generic checklist or one undifferentiated text field.

Create a Strategy overview linking to focused workspaces for:
- **Customer Avatars** — reuse the existing Office → Funnels avatar structure, including Who they are, Motivations, Objections, Language they use and Evidence where supported by the existing design.
- **Offers & Products** — reuse the existing Office → Funnels structure and sections.
- **Stories** — reuse the existing Office → Funnels story-bank structure.
- **Brand Kit** — exactly **one Brand Kit per client** in this Clients workflow. Use singular “Brand Kit”; do not create a collection or allow multiple kits for one client. The client supplies it for now; the team records/uploads it here. Do not create a separate competing brand-kit authoring system.
- **Funnel Strategy Document** — a plain document/editor workspace where the team can write, edit and save the actual funnel strategy. This is distinct from the structured avatar, offer, story and Brand Kit records.

Recommended layout: one Strategy overview with links/cards to those four structured workspaces and the Funnel Strategy Document; each opens a focused workspace. This is a design recommendation, not owner approval.

Before implementation, establish the ownership model for client Strategy data. Make it clear whether each record is a client-specific copy or a reference to an Office → Funnels record. Do not silently duplicate data or introduce unapproved synchronization. Keep all records isolated by organization and client.

### 8.3 Copy

- Apply the existing Layer2Funnels Copy-stage requirements and workflow from earlier project work.
- Locate and review the source requirements before finalizing this stage. Do not guess, replace or silently simplify them.
- Files created or uploaded in Copy must also appear in that client's Documents workspace.

### 8.4 Build

Progress tracking only. Clearly explain: “The build happens in the client's ClickFunnels or GoHighLevel account. This page shows progress.” Show progress/status and the relevant owner/next action. Do not add a duplicate funnel builder, asset manager, invented toolset, or invented checklist.

### 8.5 Marketing

Show a simple, clearly labelled placeholder until the owner defines the workflow. Do not invent features or imply that a complete Marketing workflow has been specified.

## 9. Requests & Approvals

Provide a client-specific tab and a separate cross-client Requests & Approvals destination. Cross-client views include a Client column. Scoped users see only authorized client records.

- Types: **Information request** and **Approval**.
- Include title, message, stage, status, created/sent date, version where applicable, and attachments.
- Team members must be able to attach an existing relevant file **or upload/attach a custom file** to information requests and approval requests. Do not restrict attachments to a predefined list.
- Approval requests must identify the exact file/version being approved. Preserve that version and its decision history when a revision is created.
- Keep internal review and client approval as separate states/areas.
- Statuses may include Draft, Waiting on client, Responded, Reviewed, Approved and Changes requested.
- Provide appropriate actions for reviewing a response, creating a new revision, cancelling a pending request and preparing a reminder, only where the backend supports them.
- Clearly label prototype/backend-dependent actions. Never claim an email, reminder or client-facing message was sent unless the backend confirms it.
- The Client Portal is locked. Do not expose requests to clients or send invitations until the separate Portal security/go-live approval passes.

## 10. Documents — one file workspace per client

Documents is the central file workspace for the **current client only**, across all stages.

- Every file created or uploaded in Brand Base, Strategy, Copy, Build or Marketing must appear in that same client's Documents area.
- Organize files by stage and provide useful search/filter/sorting.
- Provide **Upload file** so the team can add additional custom files directly to that client.
- Each file has explicit visibility: **Internal only** or **Shareable with client**. “Shareable” records an intended permission; it does not mean the Portal is live.
- Show available metadata such as filename, stage, version, owner, updated date and visibility.
- Allow authorized users to share or stop sharing a specific file/version with clear confirmation.
- Internal-only files must never appear in client messages or Portal payloads. Team Notes are always private.
- Client files must not leak through search, counts, previews, downloads, exports, URLs, APIs, storage paths or background jobs.
- Files owned by the Clients app must **not automatically appear in the main shared Drive**. The protected shared Drive and its canonical SOPs are separate.
- Do not show a Brand Kit card in Documents. Brand Kit is part of Strategy.
- Do not activate a new storage service or incur costs as part of design work. Use the approved architecture after implementation planning and owner approval.

## 11. Team Notes

Show a prominent notice: “Team only. Never shown to the client, in the Portal or in client messages.”

Support adding notes, pin/unpin and deletion only by authorized roles (for example, author or authorized admin). Team Notes must not enter client exports, shared files, Portal payloads or client-facing AI context unless a separate, explicit policy is approved.

## 12. Manage client sharing

Use **Manage client sharing** as the preferred label. The interface must explain what the Portal is intended to show: milestones, prepared updates, requests/approvals and individually selected shareable files. Team Notes and internal-only files are never shared.

The Portal remains locked until the separate security/go-live gate is approved. Do not send invitations, claim live access, or expose content before that gate passes.

## 13. Archive, restore and delete

- Archive removes the client from the default open list and would pause Portal access if the Portal is enabled; it does not delete data.
- Restore returns the archived client according to existing status rules.
- Permanent deletion is for archived clients only and only for roles authorized by the existing permission catalog.
- Clearly warn that deletion is irreversible and may remove the client's files, notes, requests and approval history.
- Do not present “Export first” as a working feature unless the backend implements and tests it.
- Sensitive changes must be authorized server-side and audited.

## 14. SOPs, Tools and Settings

- **SOPs:** five stage SOP links to the protected canonical documents in the shared Drive. Link to them; do not copy them into client-owned Documents.
- **Tools:** separate destination listing tools by access level. Show only tools the current user is authorized to access.
- **Settings:** Owner/Admin only. Stage configuration and step counts only where supported by the approved data model and permissions. Build has no invented tool/checklist steps. Do not silently change existing stage names or stored data; propose any migration separately for approval.

## 15. Security, isolation and permissions

These are application-wide requirements, not per-screen suggestions:
- Enforce organization/workspace and client isolation in database policies, server/API, search, counts, exports, file previews/downloads, integrations and background jobs—not only in the UI.
- Default-deny cross-client and cross-workspace access.
- A user scoped to one client sees only that client. Do not reveal other client names, records, counts, files, notes or activity.
- Switching organizations must clear stale client data and never show a record belonging to another organization.
- Viewer is read-only. Enforce effective permissions server-side; UI visibility must reflect the actual permission result.
- Keep audit trails for sensitive mutations.
- Do not modify live Supabase/database records, auth settings, security policies, deployments, DNS or paid infrastructure without explicit approval.

## 16. Responsive design, accessibility and shared patterns

- Design a complete, professional application using the approved shared shell, typography, color tokens and organization switcher. Do not copy the incomplete HTML prototype.
- Desktop/tablet layouts should prioritize clear hierarchy and efficient scanning, not a generic stack of unrelated cards.
- Tables become labelled stacked rows on phones; stage navigation follows the approved mobile shell.
- Interactive targets should be at least 44px where practical.
- Keyboard focus must be visible; dialogs should trap focus and support Escape where appropriate; tabs use correct semantics; respect reduced-motion preferences.
- Include loading, empty, no-results, error, no-access/not-found, read-only, archived, unsaved-changes, success and disabled-Portal states.
- Never make a backend-dependent action look functional if it is not implemented.

## 17. Claude Design handoff

1. Read this **entire Markdown file** first. It is the source of truth.
2. Read `docs/design/06-funnels.md` and the relevant approved shared shell designs, including Design 01 and Design 10.
3. Review the owner's handwritten Design 09 notes supplied with the project.
4. Treat `09-clients.html` only as an incomplete early prototype; do not copy it or assume it is complete.
5. Locate and apply the existing Copy-stage requirements.
6. Produce a complete new visual design for the whole Clients application: list views, client record tabs, stage workspaces, Strategy sub-workspaces, in-app form builder, requests/approvals, Documents, team notes, SOPs, Tools, Settings, mobile views, and all required states.
7. Clearly flag unresolved data-ownership or backend questions. Do not invent backend functionality.
8. Return the new design for owner review. Do not mark it approved or request implementation until the owner explicitly approves it.

## 18. Claude Code handoff and implementation guardrails

**Claude Code must follow these instructions when later asked to implement this application:**

- Read this entire file before planning or coding. This Markdown file overrides conflicting details in the incomplete `09-clients.html`.
- First inspect the existing repository, current branch, app architecture, data model, API contracts, permission catalog and relevant tests. Report the proposed implementation plan before changing files.
- Do not implement the visual UI until the owner has explicitly approved the new Claude Design output.
- Do not change the locked architecture, introduce a new framework/library/service, or create a parallel source of truth without approval.
- Do not modify the original Funnel Mapper Pro repository, its Supabase/Vercel projects, paused projects, or unrelated application code.
- Do not perform live database migrations/writes, deployments, auth/security changes, DNS changes, storage activation or paid spending without explicit owner approval.
- Preserve existing data and backward compatibility. Propose any schema change or migration first; do not silently rename or reseed stages/statuses.
- Enforce organization and client isolation server-side for every query and mutation, including forms, uploaded files, requests, search, exports, previews, background tasks and future integrations. Add tests proving cross-client and cross-organization access is denied.
- Keep client-owned files separate from the main shared Drive. Do not enable automatic syncing or activate additional storage infrastructure.
- Do not claim a message, reminder, upload, share, invitation or deletion succeeded unless the implemented backend returns success.
- Mark unimplemented integrations/actions honestly and do not use mock behavior that could be mistaken for a live client-facing action.
- Implement in small, reviewable steps; run existing tests and add relevant tests. Report files changed, tests run, limitations and any decisions requiring owner input.
- Stop and ask the owner before proceeding if implementation would violate a locked rule or require a consequential unresolved decision.

## 19. Decisions still requiring resolution

1. **Office → Funnels data ownership:** For each Strategy record, decide whether it is a client-specific copy or a reference to a canonical Office → Funnels record. Recommend a safe model before implementation; do not silently duplicate or sync.
2. **Copy-stage requirements:** Locate the earlier requirements and reference their exact source in the design handoff.
3. **Form-builder integration:** Locate the existing approved form-builder technology and confirm its API/embedding capability before selecting anything new.
4. **Client Portal:** Remains locked until the separate security/go-live gate passes.
5. **Marketing:** Placeholder only.
6. **Existing statuses/stages:** Preserve stored values until an approved migration plan exists.

**Approval gate:** This document updates requirements only. It is not approval of a visual design, approval to implement, or permission to change application code or production systems.
