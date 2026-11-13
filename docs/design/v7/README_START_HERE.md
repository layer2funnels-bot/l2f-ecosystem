# Layer2Funnels + Aurj ecosystem: final design (v7) and Claude Code delivery package

Date: 13 November 2026. Designer: Claude (Opus), lead product designer for this round.
This package is the **final, approved design** to implement. Further design changes happen in a new chat (see `NEW_CHAT_HANDOFF.md`).

## What is in here

| Path | What it is | Who uses it |
|---|---|---|
| `ecosystem-v7.html` | The complete interactive prototype. Open it in Chrome. Start at `#/map` for the list of every page (122 routes). | Tabish, Claude Code |
| `screens/desktop/*.jpg` | One screenshot of every route at 1440 px (file names = route). `screens/phone/` = 10 key pages at 390 px. | Claude Code (visual reference) |
| `docs/00_ECOSYSTEM_OVERVIEW.md` | App map, what is new vs the repo (change register), implementation order. | Read first |
| `docs/01_DESIGN_SYSTEM.md` | Tokens, type scale, sizes, components, per-app identity, motion, icons. | Every app |
| `docs/02_GLOBAL_SHELL.md` | Left rail, Launcher, global search, notifications, profile page, org switch, branding, links and right-click. | Every app |
| `docs/03_PERMISSIONS_DATA_INTEGRATIONS.md` | Identity and relationships, app and feature permissions, client access, shared client records (Clients ↔ Funnel Mapper), files, storage and versions. | Office, Clients, FM, Projects, Drive |
| `docs/apps/*.md` | One implementation brief per app: pages, routes, components, behaviour, data, permissions, states, responsive, acceptance tests. | The app being built |
| `docs/04_OPEN_DECISIONS.md` | The few business decisions still open, with the assumption the design uses. | Tabish |
| `prompts/P0x_*.md` | **Paste-ready prompts for Claude Code, one per app**, in build order. | Tabish → Claude Code |
| `assets/tokens.css`, `tokens.json` | Design tokens exported from the prototype (both organizations × light/dark). | Claude Code |
| `assets/icons.svg`, `icons.json` | All 145 icons (24 px grid, 1.6 stroke, round caps). Names are used throughout the docs. | Claude Code |
| `assets/logos/` | Layer2Funnels icon + wordmark, Aurj badge + cap (originals from Tabish). | Shell, Admin › Branding |
| `prototype-source/` | The prototype's source modules (vanilla JS + CSS) so exact markup, sizes and animations can be copied. | Claude Code |
| `NEW_CHAT_HANDOFF.md` | Everything a new design chat needs to continue (history, decisions, Tabish's preferences, open work). | Next design chat |

Tabish's manager also wrote `Layer2Funnels_Claude_Code_Design_to_Implementation_Handoff.docx`. It is compatible with this package: it describes **how** Claude Code should work (plan all briefs first, then one app at a time, report, get approval). This package supplies **what** to build. Give Claude Code both.

## How Tabish uses this (simple)

1. Put this folder in the repository at `docs/design/v7/` (commit it).
2. Open a Claude Code session in the repo. Paste `prompts/P00_FOUNDATION.md`. Approve its plan.
3. When the foundation is done and you approved it, paste the next prompt (`P01_OFFICE.md`, then `P02_PROJECTS.md`, …). One app per session is best.
4. After each app, check it against the prototype (same route) and the acceptance list at the end of that app's brief.

## Ground rules for Claude Code (repeated in every prompt)

- The prototype shows the **design**. Its data, toasts and "prototype only" actions are fake. Never ship prototype data.
- **Preserve existing functionality.** Planner, Projects and Funnel Mapper already work: apply the design, add only what the brief marks **NEW**. Do not remove features.
- Every switch in permissions must be enforced on the server and in the database, never only by hiding a button.
- Layer2Funnels and Aurj data never mix.
- Status legend used in every brief: **[E]** existing, keep as is · **[R]** existing, redesign · **[N]** new, build · **[F]** future, design only (show disabled with "Later" or don't build).
