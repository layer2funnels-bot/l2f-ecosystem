# Funnel Mapper (formerly Funnel Mapper Pro) · implementation brief

Repo: **separate repository** `Funnel-Mapper` (Next.js 16, Supabase, React Flow, Zustand; `PROJECT_STATUS.md`, `reference/ project/*.dc.html` design boards, `docs/MASTER_HANDOFF.md`). In the ecosystem repo there are `apps/funnel-mapper` / `apps/funnel-mapper-pro` placeholders. **Its design and functions are approved; do not redesign or change its maths, maps, editor, reports, sharing, presentation or exports.** Prototype `fmp6.js` (+v7 sizes) mirrors the real app inside the ecosystem: routes `#/fmp/...`.

## Changes
1. **Rename [R]**: every user-facing "Funnel Mapper Pro" → "**Funnel Mapper**" (titles, nav, launcher, emails, PDF/exports, share pages, meta tags). Keep package names, repo name, Vercel project, DB names unless a later approved migration.
2. **Ecosystem fit [R]**: render inside the ecosystem rail (org switch, apps, search, notifications, profile) when opened from the ecosystem; FM's own sidebar stays (Home, Clients, Funnels, Templates, Trash; Pinned clients; Settings; Help & shortcuts) with the org shown at the top instead of FM's workspace switcher. FM's own dark navy + emerald theme stays (it is the app's identity). Editor keeps its own full-screen chrome (no rail); the apps-grid button gives the way out.
3. **Sizes one step up [R]** (feedback: everything too small): base 13.5 → 14.5 px; sidebar items 14.5 px / 38 px; page titles 30 px; KPI values 30 px; table rows 46 px / 14 px; buttons 34 px (small 30); top bar 52 px; library tiles and product rows +1 px; blocks 170 px wide with 13.5 px titles; inspector title 17 px; KPI bar 13.5 px. Check every page incl. forms (New client sheet, New funnel dialog, template customize, share, settings).
4. **Shared clients [N]** (03 §3): FM reads clients from the ecosystem **Client service**; "New client" in FM creates through the service (dialog: name, business, email, status; duplicate check "Link to existing"); clients created in Clients appear in FM automatically. FM keeps client-specific data (products, notes, pricing model, funnels). Banner on FM Clients page: "Shared with the Clients app…". FM client page links "Open in Clients". Org boundaries: L2F only (Aurj shows "isn’t set up in Aurj" + switch).
5. **Team/workspace settings**: FM Settings › Team, Workspace & branding, Independent accounts show a notice that the ecosystem manages these in Office › Admin; keep pages working until data is migrated (open decision for the migration timing).

## Integration plan (safe order)
1. Read-only: FM lists ecosystem clients next to its own (behind a flag). 2. Matching report (email/name) for Tabish to approve. 3. Write-through creation from FM. 4. Switch FM to the service as source of truth; keep old rows with `migrated_to` until verified. No destructive migration without approval.

## Acceptance
- No "Pro" in any UI string (grep test). Golden funnel numbers unchanged (89.1 / 6,032.11 / 5,582.11 / 13.40x).
- Create client in FM → appears in Clients; in Clients → appears in FM; same email → one record.
- Visual sizes match prototype `#/fmp/home`, `#/fmp/funnels`, `#/fmp/client/sc`, `#/fmp/funnel/pt`, `#/fmp/funnel/pt/reports`, `#/fmp/settings`.
