# Funnel Mapper copy: change ledger

The pristine copy is the git tag **`fmp-copy-pristine`** (commit `ca5f42a`, source `Funnel-Mapper@13a1e86`, 654 files; hashes in `docs/fmp-copy-manifest.json`). Reshaping is approved (owner, 21 Oct 2026), so `apps/funnel-mapper/` may now differ from the tag. `npm run check:fmp-copy` enforces two things: the tag never moves, and **every file that differs from the tag has a row here** (path in backticks in the first column) with the reason. A row for a file that did not change fails the check.

Rules that still apply: code only; no real data; no connection to any live project; no deploy; the original repository is never touched.

**13 Nov 2026 (V7 stage 1).** Reshape step 1 (light ecosystem colours, header instead of the sidebar, no theme choice) was rolled back to the original design: V7, the owner's manager document ("the current Funnel Mapper design is approved") and the live app agree, and step 1 had removed working features (sidebar with pinned clients and counts, light/dark choice). Its improvements were kept: self-hosted fonts and clickable checks. Reasons per area: `docs/implementation/FUNNEL_MAPPER_DESIGN_DECISIONS.md`.

| File | Change | Reason |
|---|---|---|
| `.env.example` | Product name. Stage 2: the ecosystem's public sign-in key (renewal and sign-out only), ecosystem API/web addresses and the shared cookie domain; no service key, no sign-up code. `NEXT_PUBLIC_BASE_PATH` (live `/fmp`). | V7 rename; stage 2. |
| `app/(app)/actions.ts` | Every action runs an ecosystem API operation (`fmp.*`). "New client" creates the shared client and asks the person to decide on possible duplicates (never linked automatically). Template screenshots are accepted only from this organization's Funnel Mapper captures. Organization switching uses `org.switch`. | Shared clients (V7 03 §3, 16 §4); stage 2. |
| `app/(app)/clients/[id]/page.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). V7 16 §4: "Open in Clients" link to the client in the Clients app. | FM-7 sizes. |
| `app/(app)/clients/clients-browser.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `app/(app)/clients/page.tsx` | "Shared with the Clients app" note with "Open Clients"; reads through the ecosystem API. | V7 16 §4; stage 2. |
| `app/(app)/settings/page.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). Stage 2: only Funnel Mapper's own settings (default currency, appearance); profile, account, organization and team are the ecosystem's and are not shown here. | FM-7 sizes; stage 2 (owner, 13 Nov). |
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
| `components/app-nav.tsx` | Brand text "Funnel Mapper"; bigger text classes. Stage 2: "All apps" address; your name opens your ecosystem profile. Sign-out form carries the base path. | V7 rename; FM-7 sizes; stage 2. |
| `components/client-form.tsx` | Duplicate decision step ("Link to the selected client" / "Create a new client"), shown only when the shared list found possible matches. Bigger text classes. | V7 16 §4; never link automatically (owner, 13 Nov). |
| `components/editor/editor.css` | Editor panels, toolbars, inspector, KPI bar and library text +1 px. Map blocks, lines, frames and notes unchanged. Clickable check rows (`.fm-kcheck`). | FM-7 sizes (maps and exports must look exactly as before); audit P0 clickable checks. |
| `components/editor/forecast-charts.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `components/editor/kpi-bar.tsx` | Each model check in the checks popover is a button: it selects and zooms to its block, or opens the funnel panel. | Audit P0 "make warnings clickable". |
| `components/page-header.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). | FM-7 sizes. |
| `components/theme-toggle.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). Light/dark is remembered per device (it was saved on the old Funnel Mapper account, which no longer exists). | FM-7 sizes. |
| `components/top-strip.tsx` | Fixed-size text classes (`text-[N px]`) one step up (+1 px). Search form carries the base path. | FM-7 sizes. |
| `components/workspace-switcher.tsx` | Organization switcher the same as the ecosystem's (organization mark, "Your organizations", role, "Current", same footer); switching uses the ecosystem rule (`org.switch`): the ecosystem remembers the choice for every app, the same page is kept, a client or funnel never comes along, and "isn't set up" when Funnel Mapper is off there. "All apps" back to the Launcher. After a switch, the page address carries the base path. | V7 16 §2; owner, 13 Nov: switching the same as other apps. |
| `lib/ecosystem/clients.ts` | Added: duplicate-decision helpers for the ecosystem Client service (`fmp.clients.*`). | Shared clients; always on since stage 2. |
| `lib/supabase/database.types.ts` | Regenerated: `clients.ecosystem_client_id`. | Follows the new migration. |
| `supabase/migrations/20261113000000_ecosystem_client_ref.sql` | Added: nullable `clients.ecosystem_client_id` (unique when set). | Funnel Mapper's own row points at the shared client; null for every existing row. |
| `supabase/templates/invite.html` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (e-mails). |
| `supabase/templates/magic_link.html` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (e-mails). |
| `supabase/templates/recovery.html` | "Funnel Mapper Pro V2" → "Funnel Mapper". | V7 rename (e-mails). |
| `tests/e2e/workspaces.spec.ts` | Expected invitation text uses "Funnel Mapper". | Follows the e-mail template rename. |
| `tests/unit/branding.test.ts` | Added: no "Funnel Mapper Pro" in UI, metadata or e-mail templates. | V7 acceptance (grep test). |
| `tests/unit/ecosystem-clients.test.ts` | Added: shared-client calls (token and organization sent, duplicates returned for a decision, failures never save locally). | Shared clients. |

## Stage 2: Funnel Mapper on the ecosystem (sign-in, data, files)

Every read and write goes through the ecosystem API as the signed-in person; the API and database decide access (organization, role, client scope). Owner decisions of 13 Nov: independent accounts retired, Cloudflare hosting, only the owner switches first.

| File | Change | Why |
|---|---|---|
| `app/(app)/clients/[id]/portfolio-bits.tsx` | Client logo saves a stored file path (`logo_path`) through `fmp.clients.update`. | Stage 2. |
| `app/(app)/clients/new/page.tsx` | Reads through the ecosystem API (`lib/eco/data.ts`). | Stage 2. |
| `app/(app)/funnels/page.tsx` | Reads funnels, clients and actuals through the ecosystem API. | Stage 2. |
| `app/(app)/layout.tsx` | Organization, role and counts come from the ecosystem; "All apps" and profile addresses; no account-based theme sync. | Stage 2. |
| `app/(app)/page.tsx` | Home reads through the ecosystem API. | Stage 2. |
| `app/(app)/settings/settings-forms.tsx` | Only the default-currency form remains. | Stage 2 (owner, 13 Nov). |
| `app/(app)/templates/page.tsx` | Templates (built-in and the organization's) read through `fmp.templates.list`. | Stage 2. |
| `app/(app)/trash/page.tsx` | Trash reads through the ecosystem API; delete forever is owner-only. | Stage 2. |
| `app/(auth)/actions.ts` | Independent-user sign-up removed (owner decision: retire independent accounts). Sign-in, magic link and password reset unchanged (now the ecosystem sign-in). | Stage 2. |
| `app/api/capture/route.ts` | Returns the captured image to the browser instead of re-encoding it with sharp and storing it; the browser shrinks and stores it. | Stage 2. |
| `app/api/share/[token]/comments/route.ts` | Public share comments go through the ecosystem's `/api/public/fmp-share` (token hashed there). | Stage 2. |
| `app/api/share/[token]/route.ts` | Public share reads and saves go through the ecosystem's `/api/public/fmp-share`. | Stage 2. |
| `app/funnels/[id]/page.tsx` | Funnel, client, products, last version and open comments read through the ecosystem API. "All apps" address for the editor. | Stage 2. |
| `components/editor/actuals-entry.tsx` | Real numbers save through `fmp.actuals.save` (CSV imports in batches of 500). | Stage 2. |
| `components/editor/actuals-host.tsx` | Real numbers load and save through `fmp.actuals.list` / `fmp.actuals.save`. | Stage 2. |
| `components/editor/actuals.tsx` | Real numbers load and save through `fmp.actuals.list` / `fmp.actuals.save`. | Stage 2. |
| `components/editor/assets.ts` | Saved styles and blocks through `fmp.assets.*`. | Stage 2. |
| `components/editor/comments.tsx` | Comments through `fmp.comments.*`. | Stage 2. |
| `components/editor/editor.tsx` | Status, saves, autosave versions and thumbnails through the ecosystem API and file storage. "All apps" button in the editor top bar (V7 16 §2: the editor's way out). Share-page saves carry the base path. | Stage 2. |
| `components/editor/exporters.ts` | Stored images signed through `fmp.files.url`. | Stage 2. |
| `components/editor/share-dialog.tsx` | Share links through `fmp.links.*`; a new link's address is shown once (only its hash is stored). Copied and opened share links carry the base path. | Stage 2. |
| `components/editor/template-dialog.tsx` | Save as template through `fmp.templates.create`. | Stage 2. |
| `components/editor/thumbnail-field.tsx` | Page capture stored from the browser (`captureAndStore`). | Stage 2. |
| `components/editor/versions.tsx` | Version history through `fmp.versions.*`. | Stage 2. |
| `components/logo-upload.tsx` | Images shrunk in the browser (WebP under 100 KB) and stored in the organization's files; preview through a signed address. | Stage 2. |
| `components/signed-image.tsx` | Signed addresses from `fmp.files.url`. | Stage 2. |
| `components/template-customize.tsx` | Page capture stored from the browser (`captureAndStore`). | Stage 2. |
| `lib/image-client.ts` | Browser image pipeline for stored images (`optimiseForStorage`, `pictureForBlock`, `sizeLine`), replacing the sharp server pipeline. | Stage 2. |
| `lib/queries.ts` | Template options read through the ecosystem API. | Stage 2. |
| `lib/schemas.ts` | Row types follow the ecosystem's `fmp` records. | Stage 2. |
| `lib/share/server.ts` | Share pages read through the ecosystem's public share endpoint. | Stage 2. |
| `lib/supabase/proxy.ts` | Every private page needs the shared ecosystem session: renewed shortly before it expires (written back for the other apps); without one, the ecosystem sign-in page, which brings the person back to the same page (built from `NEXT_PUBLIC_SITE_URL`). | Stage 2. |
| `lib/supabase/server.ts` | `requireUser` uses the shared session (no Supabase client): organization from the ecosystem, profile from `profile.get`; no session or an ended one → the ecosystem sign-in. An organization where Funnel Mapper is off → `/unavailable`; a busy service → the error page. | Stage 2. |
| `package-lock.json` | Follows `package.json`. | Stage 2. |
| `package.json` | `sharp` removed (images are shrunk in the browser); Next 16.4.6 (needed by the Cloudflare adapter); `@opennextjs/cloudflare` and `wrangler` (dev only); scripts `cf:build`, `cf:size`, `cf:deploy`. | Stage 2; owner decision: Cloudflare hosting. |
| `app/(auth)/join/[code]/join-form.tsx` | Deleted: independent sign-up retired (owner decision). | Stage 2. |
| `app/(auth)/join/[code]/page.tsx` | Deleted: independent sign-up retired (owner decision). | Stage 2. |
| `app/api/image/route.ts` | Deleted: images are shrunk in the browser and stored through `fmp.files.upload`. | Stage 2. |
| `lib/image-optimise.ts` | Deleted: sharp pipeline replaced by the browser pipeline in `lib/image-client.ts`. | Stage 2. |
| `lib/image-pipeline.ts` | Deleted with `lib/image-optimise.ts`. | Stage 2. |
| `lib/independent.ts` | Deleted: independent accounts retired. | Stage 2. |
| `lib/supabase/admin.ts` | Deleted: no service key in Funnel Mapper; people are managed in Office › Admin. | Stage 2. |
| `scripts/recompress-images.mts` | Deleted: maintenance script for the old storage buckets. | Stage 2. |
| `tests/unit/image-pipeline.test.ts` | Deleted with the sharp pipeline. | Stage 2. |
| `app/(auth)/unavailable/page.tsx` | Added: "Funnel Mapper isn't set up for …" with "Switch to …" for the person's organizations where it is on; without a session, the ecosystem sign-in. Sign-out form carries the base path. | Stage 2; V7 16 §4. |
| `app/api/eco/[op]/route.ts` | Added: same-site relay from the browser to the ecosystem API (allow-listed `fmp.*` and `org.list`, same-origin check). The same-origin check also accepts Funnel Mapper's configured public address (behind the /fmp gateway the server can see itself under another host). | Stage 2. |
| `lib/eco/browser.ts` | Added: `ecoCall` for components. Calls carry the base path. | Stage 2. |
| `lib/eco/core.ts` | Added: ecosystem API call with the person's token and organization; "no organization" marker for `org.list`; Launcher, Clients-app and profile addresses. | Stage 2. |
| `lib/eco/data.ts` | Added: server reads in the shapes the screens use; client logos signed for one hour. | Stage 2. |
| `lib/eco/server.ts` | Added: the token from the shared session cookie, the current organization as the ecosystem remembers it (same default as the web app), `eco` / `ecoRows`. A failed organization list is reported as such, never as "no access". | Stage 2. |
| `lib/eco/upload.ts` | Added: image upload to the organization's files, signed addresses, page capture storage. Calls carry the base path. | Stage 2. |
| `.gitignore` | Cloudflare build folders (`.open-next/`, `.wrangler/`) ignored. | Stage 2: Cloudflare hosting. |
| `eslint.config.mjs` | Lint skips the Cloudflare build folders. | Stage 2: Cloudflare hosting. |
| `next.config.ts` | Server builds get a stub for elkjs (Tidy Up runs in the browser), keeping the Worker under Cloudflare's free 3 MiB. One address: `basePath` from `NEXT_PUBLIC_BASE_PATH` (live `/fmp`). | Stage 2: Cloudflare hosting. |
| `lib/elk-server-stub.ts` | Added: the server's stand-in for elkjs. | Stage 2: Cloudflare hosting. |
| `open-next.config.ts` | Added: Cloudflare adapter configuration (`@opennextjs/cloudflare`). | Stage 2: Cloudflare hosting. |
| `scripts/cf-size.mjs` | Added: `npm run cf:size` checks the compressed Worker against the free 3 MiB limit (2.76 MiB on 13 Nov). | Stage 2: Cloudflare hosting. |
| `wrangler.jsonc` | Added: Cloudflare Worker settings (name `funnel-mapper`, Node compatibility). No account, domain or secret in it. | Stage 2: Cloudflare hosting. |
| `AGENTS.md` | Added: the note `next dev` 16.4 writes for coding assistants (kept so the tree stays clean). | Stage 2: Next 16.4.6. |
| `app/error.tsx` | Added: "This page couldn't load … Try again" when the ecosystem service is busy or out of reach (nothing changed). | Stage 2: same error state as the other apps. |
| `components/switch-org-button.tsx` | Added: "Switch to …" button for the not-available page. | Stage 2. |

## One sign-in for every app, fresh start (owner decisions, 13 Nov 2026)

Owner: "only one sign-in, the main ecosystem sign-in, to access any app" (chosen: Funnel Mapper on the same domain, one shared session cookie); "I don't want old data … it's a fresh start"; templates: only the 13 built-in ones (unchanged, `lib/templates13.ts`).

| File | Change | Why |
|---|---|---|
| `lib/eco/shared-session.ts` | Added: reads the ecosystem's shared session cookie (`l2f-session`), renews it with the public key and writes it back, the ecosystem sign-in address, token claims for display. | One sign-in. |
| `app/auth/signout/route.ts` | Signs out everywhere: ends the session at the sign-in service, removes the shared cookie, opens the ecosystem sign-in page. | One sign-in. |
| `app/(auth)/login/login-form.tsx` | Deleted: Funnel Mapper has no sign-in page. | One sign-in. |
| `app/(auth)/login/page.tsx` | Deleted: Funnel Mapper has no sign-in page. | One sign-in. |
| `app/(auth)/reset-password/page.tsx` | Deleted: passwords are reset on the ecosystem sign-in page. | One sign-in. |
| `app/(auth)/update-password/page.tsx` | Deleted: passwords are changed in the ecosystem. | One sign-in. |
| `app/auth/accept/page.tsx` | Deleted: invitations are accepted in the ecosystem. | One sign-in. |
| `app/auth/callback/route.ts` | Deleted: e-mail links go to the ecosystem. | One sign-in. |
| `app/auth/confirm/route.ts` | Deleted: e-mail links go to the ecosystem. | One sign-in. |
| `app/auth/removed/route.ts` | Deleted: removal is handled by the ecosystem. | One sign-in. |
| `lib/supabase/client.ts` | Deleted: no Supabase sign-in client in Funnel Mapper. | One sign-in. |
| `wrangler.production.jsonc` | Added: the live Worker (fmp.tabishriaz.com, same domain as the ecosystem for the one sign-in); public values only. Now: no address of its own (office.tabishriaz.com/fmp through the ecosystem site), base path `/fmp`. | Go-live, owner approval 13 Nov 2026. |
| `scripts/cf-deploy.mjs` | Added: `npm run cf:deploy` builds with the live public values, checks the free-plan size, publishes. | Go-live. |

## One address for every app (owner, 13 Nov 2026)

Owner: "I don't want 2 URLs for one app, everything will be under office.tabishriaz.com, all the apps, Funnel Mapper as well." Live, Funnel Mapper is office.tabishriaz.com/fmp (Next.js `basePath`, `NEXT_PUBLIC_BASE_PATH=/fmp`); the ecosystem site hands /fmp/* to the Funnel Mapper Worker (`functions/fmp/[[path]].js`, service binding). Same address, so the sign-in cookie is shared without any cookie-domain setting. Locally the base path is empty.

| File | Change | Why |
|---|---|---|
| `lib/base-path.ts` | Added: the base path and `withBase` for plain addresses (fetch, form actions, images, copied share links). | One address. |
| `components/editor/lib-tile.tsx` | Block artwork addresses carry the base path. | One address. |
| `lib/block-art.ts` | Block artwork addresses carry the base path. | One address. |
| `components/editor/share-comments.tsx` | Share-page comments call `/fmp/api/share/...` live. | One address. |
