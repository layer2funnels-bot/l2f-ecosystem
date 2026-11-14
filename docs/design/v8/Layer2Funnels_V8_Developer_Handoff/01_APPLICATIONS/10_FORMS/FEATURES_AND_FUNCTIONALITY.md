# Forms · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] Portal: tabs Home, Requests, Approvals, My notes (Messages and Files removed).
- [N] Whiteboard folders; [R] full-page canvas with floating tools.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

#### Forms [E] (renamed from Form Builder)
Keep as built. Additions: nav label "Responses" (summary first: KPIs, charts per question, then the table); "Automations" button shown as Later.



## 3. What V8 changes visually (no functional change)

- Builder properties panel uses the right-panel size system (labels 13.5 px, inputs 38 px, section labels 13.5 px sentence case).
- Responses: sentence-case chart headings are a recommendation (R4), not yet applied.

## 4. Existing behaviour as specified in V4 (approved 23 Oct 2026)

For apps marked [E] ("keep as built") this is the detailed description of what exists. It is historical: where it disagrees with §2 or a later decision (e.g. Portal Messages/Files removed, "Form Builder" renamed "Forms"), §2 and `04_OPEN_DECISIONS.md` win. Visual values here are superseded by V8.

#### 7. Form Builder [forms/*]
Forms list, Submissions (export needs backend), Templates. Builder: field palette (11 types), canvas with select / move / duplicate / delete, properties (question, help, required, options, Show-if logic), Build ↔ Preview (phone/desktop frame), Publish dialog (share link, embed, send to client record). The same builder component opens inside Clients.
#### Form Builder
- Forms list; builder with 11 field types and show-if logic; validation (required, formats, min/max, file type and size limits); settings (confirmation message, redirect); preview phone/desktop; **versions** (publishing creates a version; submissions tied to the version they answered); submissions (list, view, search, status, delete owner-only; export needs backend); templates; scope = organization form or client-linked form whose answers feed Brand Base; file uploads through the storage adapter; privacy and retention note; RTL/Urdu.
- **Public publish and embed stay disabled** until a security review (spam, rate limits, CAPTCHA, privacy notice) and owner approval; internal use and share-in-Clients only.
- Workflows: build, preview, publish a version, record a submission, review. Screens: list, builder, preview, publish dialog, submissions, submission detail, templates, settings. States: empty, loading, error, no-access, draft vs published, retention note. Relationships: Clients (Brand Base overlay), Drive (uploads), Approvals. Permissions: `forms.form.*`, `forms.submission.*` with client scope. Dependencies: 0019 (exists), 0027.
#### Other apps: workflow, states, relations, permissions, dependencies
| App | Core workflows | States to cover | Relations | Permissions | Depends on |
|---|---|---|---|---|---|
| Launcher | open app, find app, see why locked/soon | locked, soon, not here, next round, no weather | catalog, grants, weather op | `launcher_catalog()` | app manifests, MET op |
| Office | home, funnels records, strategies, documents, team, apps, admin | first use, no match, no access | Drive org space, Projects module, Admin | office/funnels/admin keys | Drive, Projects |
| Projects | plan, assign, track time, archive, search | empty, archived read-only, no access | Clients (optional), Drive docs, whiteboards | `projects.*` with client/project scope | 0013 |
| Clients | onboard, stages, requests, approvals, notes | first use, archived, client-scoped | Funnels copies, Forms, Drive, Portal | `clients.*` | 0025 |
| Drive | upload, organize, share, version, trash | empty, trash, protected SOP, personal | all apps (documents), storage adapter | `drive.*` | 0014, 0023 |
| Client Portal | see progress, approve, answer | preview-only ribbon (gate G2) | Clients, Approvals | projections only | G2 owner approval |
| Whiteboard | draw, open in context, All boards | empty, saving, newer version exists | Drive documents, Projects, Clients | Drive rights + context | 0024 |
| Planner | placeholder | soon | Projects tasks (later) | none yet | external onboarding, V4-9 |
