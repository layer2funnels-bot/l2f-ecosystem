# UI/UX Handoff for the design session (prepared 21 Oct 2026)

Deliverable D. Read with `APP_STRUCTURE_REVIEW.md` and `ARCHITECTURE.md`. No design work was done in this session.

## 1. Inputs
- App specs 00–11 (your brainstorm pack, 20–21 Oct) · Combined Rules · Phase 3 canvas (60 boards) · design tokens: `packages/ui/tokens.json` → `tokens.css` (single source; CI checks contrast; includes focus ring, 44px target, motion, layers, breakpoints 900/600).
- Data rules already enforced in the database (design must not promise anything the database refuses): org isolation, client/project scope, app grants, client-visible allowlist, Portal off by default, archive-before-delete, owner-only access management.

## 2. Global shell decisions for the session
| Topic | Existing idea | [Rec] for design |
|---|---|---|
| Org switcher | Phase 3: switcher only in shared apps | One switcher in every app header; always shows active org; switching never mixes |
| Navigation | Different per app | Same header (org, search, notifications, profile) everywhere; app menu on the left |
| Admin | Scattered | Office → Admin: Members, Access (levels, groups, assignments, effective access), Apps, Integrations, Audit |
| Contextual access | Drive "Manage access" | Same compact panel pattern for clients, projects, files, boards |
| Coming soon | Agents | Tile + one page; no forms or waitlist |

## 3. Screens to design, in build order
**Slice 0 (blocks everything):** sign in · sign up · verify email · reset password · accept invitation (email must match) · signed in without any organization ("ask your admin for an invitation") · session expired · Launcher (tiles from `launcher_apps`, coming-soon state, FMP tile "opens in a new tab · own sign-in for now").
**Office:** Home · Admin → Members (invite, role, deactivate) · Access (levels per app, groups, assign at org/client/project scope, restrictions with reason/expiry, effective-access view showing *why*) · Apps (enable, Portal switch owner-only with warning) · Integrations · Audit.
**Clients:** list (table/pipeline) · client record tabs (Overview, Work, Requests & Approvals, Documents & Brand Kit, Team Notes) · stage workspace with step actions (request info, send exact version, share update) · archive client (no delete for staff).
**Projects:** My Work (merged with Home) · project list · project workspace (Overview, Tasks, List/Board, Docs, Whiteboards, Activity) · task drawer with timer.
**Drive:** space selector (L2F/Aurj/Personal) · browser · Manage access panel · trash · version history · editor shell.
**Portal (design only, stays closed):** Home with 6 milestones · request reply/upload · approve exact version · files · messages.
Later: Planner, Forms, Value Ladder, Social Planner, Whiteboard.

## 4. Required states for every screen
Empty · loading (skeleton) · error (plain words, retry) · offline/saving · denied (**identical to not found**, never names the record) · session expired · disconnected integration · archived · coming soon. Never show counts of hidden items.

## 5. WCIGA design constraints
- A user may open an app yet see zero records: design that empty state on purpose.
- Links to records the viewer cannot open are not shown at all.
- Client-facing items always show audience ("Internal" / "Shared with client") and version.
- Team Notes have a permanent "internal" marker; they are never selectable for sharing.
- Approval UI shows the exact version and who approved when; editing returns it to review.
- Personal Drive never appears in org search or admin reports.

## 6. Preserve from Phase 3
Palettes (L2F blue #173A8F + coral; Aurj #B23A08 + sky), fonts (Hanken Grotesk, Schibsted Grotesk, Newsreader), six states, 44px targets, 3px focus ring, no colour-only status, logical CSS properties, three breakpoints.

## 7. Decisions approved by the owner (21 Oct) — design to these
UX1 one global org switcher in every header · UX2 Projects Home + My Work merged · UX3 Office Documents = Drive org space · UX4 SOPs live once in Drive (protected), linked from Clients stages · UX5 Admin → Access first release = levels, assignments, effective access · UX6 Portal on its own subdomain and session, ecosystem chrome, client brand kit only inside content. Full list: DECISIONS.md.

## 8. Engine constraints for design (see ENGINES.md)
Whiteboard = Excalidraw-based canvas; Docs = TipTap-based editor; Sheets later (no xlsx import/export or live co-editing in the free tier); no Slides editor in Phase 5; no live cursors in Phase 5. Design editor shells around single-user autosave + version history.
