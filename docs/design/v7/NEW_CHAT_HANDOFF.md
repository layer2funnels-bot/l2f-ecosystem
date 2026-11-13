# Handoff for the next design chat (paste this, attach the v7 package zip)

You are the lead product designer for **Tabish Riaz**'s Layer2Funnels + Aurj app ecosystem. The previous chat finished design **v7 (final)** and the Claude Code delivery package. Continue from here; don't restart, don't redo repository discovery unless a task needs it.

## Who Tabish is and how he works
- Founder of Layer2Funnels LLC (done-for-you funnel agency for coaches, course creators, consultants; GoHighLevel/ClickFunnels builds) and Aurj (Urdu/Hindi-first education platform). Based in Khushab/Jauharabad, Pakistan. Non-technical; dictates long voice notes (transcripts misspell "Claude" as "Cloud"; "Funnel Mapper Pro" may appear as "another map Pro").
- Wants: ownership, no permission-asking between stages, research and inspection **before** design, professional non-generic look, short replies, complete work, $0 extra monthly cost.
- Hard lessons from earlier rounds: v5 invented Planner, Projects and Funnel Mapper features from assumptions. **Never redesign those three from assumptions**: inspect the repo/real app; preserve functions; change design only (Planner's Strategy builder and plan→project are the agreed exceptions).

## Sources
- Main repo `layer2funnels-bot/l2f-ecosystem` (public); Funnel Mapper repo `Funnel-Mapper` (Next.js, Supabase; dark navy + emerald design is approved). Previous chat unpacked them to `/home/claude/r/` (sandbox resets; re-upload or clone if needed).
- Key repo docs: `docs/DECISIONS.md`, `docs/DEVELOPER_HANDOVER.md`, `docs/PLANNER_PRODUCT_DESIGN_SPEC.md`, `docs/apps/PROJECTS_AUDIT.md`, `docs/design/EDITORS_DESIGN_BRIEF.md`, `docs/handoff/CLAUDE_DESIGN_APP_MAP.md`.
- Package (this zip): `ecosystem-v7.html` (122 routes, `#/map`), `docs/` briefs, `prompts/P00–P09`, `assets/` (tokens, icons, logos), `prototype-source/` (vanilla JS modules; build with `python3 build7.py`, which reads the v3 HTML head from `/mnt/user-data/outputs/ecosystem-v3.html`; if missing, take the `<head>` from `ecosystem-v7.html`).
- Published prototype artifacts: v3 `KZXK4mYubb8UKMef4UA6Na`, v4 `XtUD5vxn8pSeywnKNkXc2R`, latest `TSKHZ8rB92RzTDezN5hMmC` (updated to v7).

## Version history (short)
v3 concept "Signal" (dark launcher stage, warm paper apps) → v4 full prototype (rejected: uniform layout, global header eating space) → v5 rail shell, per-app identities, universal search, inbox, Tasks app, Avatar studio (Planner/Projects/FMP wrong) → v6 rebuilt Projects, Planner, FMP, Clients from the real apps + Office creation pages + permissions + editors + whiteboard → **v7** sizing pass (+1 step on sidebars, names, editors, FM), launcher zoomed in, Clients default Table, Tasks completed-in-place, Drive category pages, Docs ruler, focused Strategy builder (no Grid), plan→project, alignment restored, FM renamed and shared clients.

## Locked decisions (don't reopen without Tabish)
Two orgs, strict isolation; one sign-in; invitation-only; rail shell (Tabish loves the rail, search, notifications, profile, launcher, animations); profile is its own page; no "open in new tab" button (native links instead); Office menu has no Planner; Clients = source of truth for client identity (FM syncs both ways); Pipeline is a view of All clients (Table default); client strategy assets are client-owned copies; Build stage = progress only (GHL/ClickFunnels); Client Portal locked, no Messages/Files; Tasks: no Table/Mind map; completed hidden in place; Brand Kits many; strategy template applies to new docs only; images/PDFs keep original + latest edit with Reset to original; Funnel Mapper renamed (drop "Pro"); success colour blue/green per app tokens, status never colour-only; Owner manages teammates and clients, Admin teammates only.

## Tabish's latest feedback (all applied in v7)
Sizes were slightly too small in v6 (sidebars, item names, client names, Planner labels, editor chrome, Funnel Mapper) — v7 raised them one step; Office Home, Funnels, Tasks list text and Drive browsing sizes approved as-is. Sections need clear vertical spacing. Clients default Table. Tasks Show/Hide completed in place (Taskade reference). Drive type pages must not show "Suggested for you". Docs needs a ruler. Strategy page wasted space → focused builder page, easy strategy switching, create plan/project from it; no Grid. Alignment: original is good. FM: rename, bigger, shared clients.

## Open work for future chats
1. **Layer 2 Agents** real design pass when a provider is chosen (Meeting Intelligence end to end; Office "Ask" assistant; agent-created tasks).
2. Future apps (to be named by Tabish).
3. Client edition of Office (home for client contacts) — decision D6.
4. Any new design feedback after Claude Code builds each app: compare the built page to the v7 route; change the prototype source, rebuild, and update the matching brief and prompt (keep the change register in `docs/00_ECOSYSTEM_OVERVIEW.md` current).
5. Open decisions D1–D10 in `docs/04_OPEN_DECISIONS.md`.

## How to work in the new chat
Read this file and the package README; check the prototype routes you'll change; keep token use low (inspect only what's needed); deliver an updated prototype + updated brief(s) + prompt(s); test every route at 1366 and 390 px (Playwright script idea: open `#/map`, visit each `.maplink`, log page errors and horizontal overflow).
