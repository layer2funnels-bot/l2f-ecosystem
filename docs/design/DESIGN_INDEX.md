# DESIGN_INDEX · Shared screens and Clients app (21 Oct 2026)

Each group has a self-contained `.html` (open it in any browser; no build step, fonts load from Google Fonts with system fallbacks) and a short `.md` spec. Design tokens come from the existing design system (`packages/ui/tokens`). The `.html` files are prototypes: use them for look, copy and behaviour, not as production code.

| # | Group | HTML | Spec | Status |
|---|---|---|---|---|
| 01 | Header + organization switcher (6 outcomes) | 01-switcher.html | 01-switcher.md | **Approved** by owner |
| 02 | Auth (7 states, 8 screens) | 02-auth.html | 02-auth.md | Approved with changes, applied. Ready |
| 03 | Launcher (12 tiles) | 03-launcher.html | 03-launcher.md | Approved with changes, applied. Ready |
| 04 | Office Home | 04-office-home.html | 04-office-home.md | Approved with changes, applied. Ready |
| 05 | Admin → Members and Access | 05-admin.html | 05-admin.md | Approved with changes, applied. Ready, but permissions need the check below |
| 06 | Office → Funnels (4 record types) | 06-funnels.html | 06-funnels.md | Approved with changes, applied. Ready, same permission check |
| 07 | Shared states | 07-shared-states.html | 07-shared-states.md | Approved with changes, applied. Ready |
| 08 | Funnel Mapper Pro in the ecosystem | 08-fmp-in-ecosystem.html | 08-fmp-in-ecosystem.md | Approved with changes, applied. Ready |
| 09 | Clients app (all pages) | 09-clients.html | 09-clients.md | **Delivered, awaiting owner approval** |
| 10 | Shell patterns (Needs-design rule, Launcher at scale, phone navigation, client-scoped access) | 10-shell-patterns.html | 10-shell-patterns.md | **Delivered, awaiting owner approval** |

Also: `DESIGN_STATUS.md` (lives at `docs/DESIGN_STATUS.md`; one row per screen, replaces in-screen "Needs design" notes).

## Owner decisions applied
- Funnel Mapper Pro is a regular ecosystem app (normal tile, same tab, same header and switcher), built from a clone. The original repo is never edited.
- FMP clients and offers keep their own data in Phase 1; moving them to ecosystem Clients and Office → Funnels is **Phase 2, later, not designed**.
- FMP people, roles and workspace settings are replaced by Admin → Members and Access from the start.
- Light by default, dark is a later option. Emerald is retired in the ecosystem copy only.
- Locked Client Portal tile shows to owners and admins only.
- Office → Funnels "Funnel maps" card stays "Link design pending". No data links designed.
- "Ask an admin" is message only, "needs backend later" (01, 03, 08).

## Checks done (headless browser)
- Widths 390px (phone) and 768px (tablet), every screen state in each file, plus the open switcher menu and dialogs: no horizontal overflow, no script errors. Tables become stacked rows on phones; the switcher menu becomes a bottom sheet.
- Touch targets: every button, link and control is at least 44px. The search field is a 44px box with an inner input.
- Keyboard: menus (arrows, Esc), dialogs (focus trapped, Esc closes, focus returns), visible 3px focus ring.
- Reduced motion: all animation stops.
- Contrast of the FMP colour mapping is computed in file 08 (amber fill alone fails 3:1, so bars carry an outline and printed numbers).
- Not checked: screen readers on real devices, browsers other than Chromium, landscape phones.

## Assumptions: confirm with the permission catalog
The catalog (migration 0004) was not available to the design chat. Everything below was chosen to fit the project and must be compared with the catalog before building. Where they differ, the catalog wins and the screen follows it.

| ID | Assumption | Where used |
|---|---|---|
| A1 | Levels are Owner, Admin, Editor, Viewer (from the FMP audit roles) | 05, 06, 03, 04 |
| A2 | The ability matrix in Admin → Access → Levels (9 abilities × 4 levels) | 05 |
| A3 | Edit, share with client, archive and restore need Editor or above; Viewer is read-only | 06 |
| A4 | Permanent delete: Owner and Admin, archived items only, type-the-name confirmation | 06 |
| A5 | Invite, manage, deactivate and remove members: Owner and Admin. Changing an owner: Owner only. The last owner can't be removed, demoted or deactivated | 05 |
| A6 | Admin pages are visible to Owner and Admin; others see the shared "not found" screen | 05 |
| A7 | Editors don't see Form Builder, Value Ladder, Social Planner or Client Portal tiles | 03 |
| A8 | Only an Owner can turn the Client Portal on (admins see the locked tile but can't turn it on) | 03 |
| A9 | The "For owners and admins" card on Office Home shows to Owner and Admin | 04 |
| A10 | Assignments can be scoped to whole organization, an app or a client; "Deny instead" is available to whoever can open Access; groups exist | 05 |
| A11 | The "Effective access" examples (areas and reasons) are samples, not real rules | 05 |
| A12 | Auth details: password minimum 10 characters; 30-second resend wait; same reset message whether or not the account exists; invitation email must match the signed-in email; Google sign-in set up at go-live; no session length stated | 02 |
| A13 | Share with client: clients come from ecosystem Clients; sections are selectable; internal notes never shared; archiving pauses client visibility | 06 |
| A14 | The "not found" screen's button goes to Office Home | 07, 05, 06 |
| A15 | Organization membership is by invitation only; "Ask an admin" sends nothing yet | 01, 03, 08 |
| A16 | In Phase 1, Funnel Mapper Pro keeps its own data per organization; it is turned on per organization (shown off for Aurj in the demos) | 03, 08 |
| A17 | Clients permissions: create a client = Owner, Admin, Editor. Edit details, steps, requests, files, notes and share with client = Owner, Admin, Editor, and an Editor holding that client only. Viewer reads everything including team notes | 09 |
| A18 | Archive and restore a client = Owner and Admin. Permanent delete = Owner and Admin, archived clients only, type-the-name | 09 |
| A19 | Clients → Settings visible to Owner and Admin only | 09 |
| A20 | SOPs & Tools: Owner and Admin see Whiteboard, Form Builder, Value Ladder, Social Planner; others see Whiteboard only; client-scoped users see none. Stage tool buttons follow the same rule | 09 |
| A21 | Team notes: delete by the author or an admin; pin by anyone who can edit | 09 |
| A22 | A client-scoped assignment grants Clients and that client's Projects only; no Office Home; no "1 of N" counts anywhere | 09, 10 |
| A23 | Delivery roles in the Clients spec (account lead, strategist, copywriter, reviewer) are labels, not separate access levels. The spec lists role permissions as an open question | 09 |
| A24 | Marking a stage complete is a manual action by Owner, Admin, Editor or scoped Editor. The spec lists the definition of "complete" as an open question | 09 |
| A25 | "Send reminder" and "Export first" are message-only (needs backend later). Portal invitations and requests are saved while the Portal is locked | 09 |
| A26 | Launcher: search from 13 apps; groups Work, Create, Client-facing, Coming soon, More are fixed; pins and recents are per person | 10 |
| A27 | Design status flag name `SHOW_DESIGN_STATUS`; status names as in DESIGN_STATUS.md | 10 |
| A28 | Phone bottom bar: more than 5 sections = first four plus More; menu order is set per app | 10 |

## Phone and tablet checks (all files 01 to 10)
- Widths 390px and 768px. Every state button in each file was clicked and measured: no horizontal overflow, no script errors.
- Also at 390px: open switcher menu (bottom sheet), dialogs, Clients list and client record, Launcher at 30 apps, phone bottom bar and More sheet.
- Every button, link, tab and select is at least 44px in both directions (the search box is a 44px label around a smaller input).
- Clients flows tested in a browser: views, all five tabs, all five stages, request dialog, share dialog, archive, restore view, scoped view, Settings.
- Not checked: real screen readers, browsers other than Chromium, landscape phones, very small phones (320px).

## Repo placement
Extract `l2f-design-files.zip` at the repo root. It creates `docs/design/` (all `.html` and `.md` files and this index) and `docs/DESIGN_STATUS.md`. Open any `.html` straight from disk.

## Not designed yet (by design)
Projects, Drive, Planner, Form Builder, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents, Client Portal, FMP Phase 2 moves, dark theme. Each app comes one at a time.

## Design v4 "Signal" (23 Oct 2026)
Folder `docs/design/v4/` (`DESIGN_SYSTEM.md`, `APP_SPECS.md`, `AUDIT.md`, `ecosystem-v4.html`, `prototype-source/`). **Owner approved v4 as the visual direction.** It supersedes the look of designs 01 to 08 (behaviour and the permission catalog still win). Screens a to g in `CLAUDE_CODE_PROMPT.md` are changed by the owner's decisions and wait for the updated design before they are built. Clients (09) and shell patterns (10) are superseded by the v4 Clients and shell; build from v4.
