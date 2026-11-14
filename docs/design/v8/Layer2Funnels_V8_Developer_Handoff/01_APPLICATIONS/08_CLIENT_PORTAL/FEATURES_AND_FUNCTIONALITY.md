# Client Portal · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [R] Portal: tabs Home, Requests, Approvals, My notes (Messages and Files removed).
- [N] Whiteboard folders; [R] full-page canvas with floating tools.

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

#### Client Portal [R] (locked until security gate G2; owners preview)
Repo `modules/portal.js`. Keep the design (journey road, approve flow, confetti on approval). Tabs: **Home · Requests · Approvals · My notes**. **Removed: Messages and Files** (clients have their own Drive; communication is not in the Portal). Requests: respond with text/files; Approvals: view version, Approve / Ask for changes (comment). My notes: private notes for the client. Header: org/agency logo, "Preview as <client>" banner for team, Exit preview → back to the client in Clients. Everything prepared while locked ("Save as prepared"); never imply it's live.



## 3. What V8 changes visually (no functional change)

- Top navigation is a row of real tabs with count badges (v7 links ran together and badges overlapped).
- Journey road, approve flow and confetti kept.

## 4. Existing behaviour as specified in V4 (approved 23 Oct 2026)

For apps marked [E] ("keep as built") this is the detailed description of what exists. It is historical: where it disagrees with §2 or a later decision (e.g. Portal Messages/Files removed, "Form Builder" renamed "Forms"), §2 and `04_OPEN_DECISIONS.md` win. Visual values here are superseded by V8.

#### 5. Client Portal [portal/*] (client view, preview ribbon until G2)
- Top navigation: Home, Requests (badge), Files, Messages, My notes. Phone: floating bottom bar.
- Journey road: six milestones Signed → Brand Base → Strategy → Copy → Build → Marketing on a curved road; done = coral/orange 3D pins, current = violet pin that gently bounces with "You are here" (no blue). Rocket progress bar "% of the way to launch".
- Next step card (exact version), approve → confetti + "Your wins" badge unlocks. "High five" to the account lead (hearts). Updates timeline, Your team.
- Requests: approve / request changes on the exact version; info requests with drop zone and answer box. Files with version. Messages threaded per request.
- **My notes**: the client's own private documents (practice, ideas). "Only you can see these"; optional "Share with team" (read only for the team). Every send/approve says "Preview only" until the Portal is live.
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
