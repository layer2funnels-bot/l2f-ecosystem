# Funnel Mapper copy: change ledger

The pristine copy is the git tag **`fmp-copy-pristine`** (commit `ca5f42a`, source `Funnel-Mapper@13a1e86`, 654 files; hashes in `docs/fmp-copy-manifest.json`). Reshaping is approved (owner, 21 Oct 2026), so `apps/funnel-mapper/` may now differ from the tag. `npm run check:fmp-copy` enforces two things: the tag never moves, and **every file that differs from the tag has a row here** (path in backticks in the first column) with the reason. A row for a file that did not change fails the check.

Rules that still apply: code only; no real data; no connection to any live project; no deploy; the original repository is never touched.

**13 Nov 2026 (V7 stage 1).** Reshape step 1 (light ecosystem colours, header instead of the sidebar, no theme choice) was rolled back to the original design: V7, the owner's manager document ("the current Funnel Mapper design is approved") and the live app agree, and step 1 had removed working features (sidebar with pinned clients and counts, light/dark choice). Its improvements were kept: self-hosted fonts and clickable checks. Reasons per area: `docs/implementation/FUNNEL_MAPPER_DESIGN_DECISIONS.md`.

| File | Change | Reason |
|---|---|---|
| `.env.example` | Product name; the unused Launcher variable from step 1 removed; three server-only switches for shared clients (empty = off). | V7 rename; shared clients (stage 1, off until the ecosystem sign-in exists). |
| `app/(app)/actions.ts` | "New client" can create the client in the shared ecosystem list first (only when switched on); asks the person to decide on possible duplicates; never saves a local-only client when the shared list cannot be reached. | Shared clients (V7 03 §3, 16 §4). |
| `app/(app)/clients/[id]/page.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `app/(app)/clients/clients-browser.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `app/(app)/clients/page.tsx` | "Shared with the Clients app" note when shared clients are on. | V7 16 §4. |
| `app/(app)/settings/page.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `app/(app)/settings/settings-nav.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `app/(app)/templates/templates-browser.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `app/(auth)/layout.tsx` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (user-facing only). |
| `app/fonts/LICENSES.txt` | Added: the three OFL licence texts. | Licence obligation for the bundled fonts. |
| `app/fonts/bricolage-grotesque-latin-500-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/bricolage-grotesque-latin-700-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/bricolage-grotesque-latin-800-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/dm-sans-latin-400-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/dm-sans-latin-500-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/dm-sans-latin-700-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/jetbrains-mono-latin-400-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/fonts/jetbrains-mono-latin-500-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch fonts. SIL OFL 1.1. |
| `app/globals.css` | Original theme (dark navy + emerald, with light as an option). Text 10–17 px one step up (+1 px) and control heights 30–38 px +2 px; Tailwind `text-xs` 13 px, `text-sm` 14.5 px. | FM-7: V7 sizes one step up; owner feedback "too small". |
| `app/layout.tsx` | Title and application name "Funnel Mapper"; fonts self-hosted (`next/font/local`, same families and weights). The dark default and the light/dark choice are the original's again. | V7 rename; builds never fetch fonts; design decision FM-7 (docs/implementation/FUNNEL_MAPPER_DESIGN_DECISIONS.md). |
| `components/app-nav.tsx` | Brand text "Funnel Mapper"; bigger text classes. | V7 rename; FM-7 sizes. |
| `components/client-form.tsx` | Duplicate decision step ("Link to the selected client" / "Create a new client"), shown only when the shared list found possible matches. Bigger text classes. | V7 16 §4; never link automatically (owner, 13 Nov). |
| `components/editor/editor.css` | Editor panels, toolbars, inspector, KPI bar and library text +1 px. Map blocks, lines, frames and notes unchanged. Clickable check rows (`.fm-kcheck`). | FM-7 sizes (maps and exports must look exactly as before); audit P0 clickable checks. |
| `components/editor/forecast-charts.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `components/editor/kpi-bar.tsx` | Each model check in the checks popover is a button: it selects and zooms to its block, or opens the funnel panel. | Audit P0 "make warnings clickable". |
| `components/page-header.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `components/theme-toggle.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `components/top-strip.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `components/workspace-switcher.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `lib/ecosystem/clients.ts` | Added: client for the ecosystem Client service (`fmp.clients.*`). | Shared clients, stage 1; off by default. |
| `lib/ecosystem/session.ts` | Added: ecosystem session placeholder (returns none until the identity bridge). | Stage 2 replaces it; until then shared clients refuse to save. |
| `lib/supabase/database.types.ts` | Regenerated: `clients.ecosystem_client_id`. | Follows the new migration. |
| `supabase/migrations/20261113000000_ecosystem_client_ref.sql` | Added: nullable `clients.ecosystem_client_id` (unique when set). | Funnel Mapper's own row points at the shared client; null for every existing row. |
| `supabase/templates/invite.html` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (e-mails). |
| `supabase/templates/magic_link.html` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (e-mails). |
| `supabase/templates/recovery.html` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (e-mails). |
| `tests/e2e/workspaces.spec.ts` | Expected invitation text uses "Funnel Mapper". | Follows the e-mail template rename. |
| `tests/unit/branding.test.ts` | Added: no "Funnel Mapper Pro" in UI, metadata or e-mail templates. | V7 acceptance (grep test). |
| `tests/unit/ecosystem-clients.test.ts` | Added: shared-client calls (token and organization sent, duplicates returned for a decision, failures never save locally). | Shared clients. |
