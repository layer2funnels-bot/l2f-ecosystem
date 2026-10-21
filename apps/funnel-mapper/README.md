# Funnel Mapper Pro

Layer2Funnels’ private, team-only tool for mapping client sales funnels, modelling the numbers, and sharing them with clients.

- **Clients and portfolios.** Each client has details, a logo, notes, products, and a set of funnels with key numbers.
- **Visual funnel editor.** Drag blocks onto a canvas, connect them, and see traffic, conversions, revenue, profit, ROAS, CPA, MRR and LTV update live. Includes Tidy up, undo/redo, versions and templates.
- **Planning tools.** Costs ledger, scenarios, a 1–60 month forecast, goal seek, planned vs actual, and presentation mode.
- **Sharing.** Read-only or editable client links (optionally hiding all numbers), client comments, and PDF/PNG/SVG/CSV/JSON export.

It is a **private internal tool**. There is no public sign-up: teammates are invited. Every page needs a sign-in except share links, which expose only the one funnel they were made for. See [docs/access-and-privacy.md](docs/access-and-privacy.md).

---

## Using the app (for teammates)

1. **Sign in** with the email you were invited with. Forgot the password? Use “Forgot your password?” on the sign-in page.
2. **Clients → New client.** Add their details. On the client page you can upload a logo, keep notes (they save automatically) and save the client’s offers as **Products**.
3. **New funnel.** Start blank or from a template.
4. **Edit the map:**
   - Drag blocks from the left. Drag from a block’s **right dot** to connect people who move on (bought / Yes / A); the **bottom dot** sends people who didn’t (No / B).
   - Click a block to edit its numbers on the right.
   - **Tidy up** arranges the map. **Ctrl Z** undoes. **?** lists the shortcuts.
5. **Saving is automatic.** Watch the dot next to the currency: *Saved*, *Saving…*, or *Offline · saved on this device*. Offline edits sync by themselves when you’re back online.
6. **Numbers.** The bar at the bottom has the headline KPIs. The right-hand panel (click the empty canvas) has tabs:
   - **Math:** every KPI plus warnings
   - **Steps:** drop-off per step
   - **Sources:** results per traffic source
   - **What-if:** sliders, a revenue goal and goal seek
   - **Costs:** expenses and payback
   - **Scenarios:** side-by-side comparison
   - **Forecast:** month by month
   - **Actuals:** planned vs actual
7. **File menu:**
   - **Save version** (also automatic every 10 minutes); restore one from **Version history**
   - **Save as template**, which the whole team can use
   - **Import / Export** (PDF report for the client, PNG, SVG, CSV, JSON)
   - **Present**, for walking a client through the funnel on a call
8. **Share** (top right): create a link for the client.
   - Choose view-only or editable, hide numbers, allow comments, set an expiry.
   - Internal block notes and screenshots are never shown on share links.
   - Client comments appear under the speech-bubble button.

---

## Running it locally

Requirements: **Node 20+**, **Docker** (for the local Supabase stack) and npm.

```bash
npm install
cp .env.example .env.local          # local defaults already filled in
npx supabase start                  # starts Postgres, Auth, Storage, Mailpit (first run downloads images)
npx supabase db reset               # applies migrations + loads demo data
npm run dev                         # http://localhost:3000
```

**Demo accounts** (local only; password `demo-password`):

| Email | Role |
|---|---|
| `demo@layer2funnels.test` | admin |
| `teammate@layer2funnels.test` | member |
| `former@layer2funnels.test` | deactivated, to show what a removed teammate sees |

Emails (invites, magic links, password resets) sent locally show up in **Mailpit** at <http://127.0.0.1:54324>.
To invite from **Settings → Team** locally, put the `SERVICE_ROLE_KEY` from `npx supabase status` into `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build && npm start` | Production build / server |
| `npm test` | Unit tests (maths matches the prototype, layout, editor state, import) |
| `npm run test:db` | Database tests: access rules, storage privacy, share links (needs local Supabase + `db reset`) |
| `npm run test:e2e` | Browser tests (Playwright) against the dev server |
| `E2E_PROD=1 npm run test:e2e` | Browser tests against a production build (run `npm run build` first) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:reset` | Re-create the local database with demo data |
| `npm run db:types` | Regenerate `lib/supabase/database.types.ts` after changing migrations |
| `npm run gen:sql` | Regenerate the built-in templates migration and `supabase/seed.sql` from `lib/templates.ts` |
| `npm run gen:fixtures` | Re-run the original prototype’s own maths to regenerate test fixtures |
| `npm run deploy` | Production deployment to Supabase + Vercel (see [docs/deployment.md](docs/deployment.md)) |
| `npm run live-check` | End-to-end verification of the live site with temporary accounts it cleans up afterwards |

Browser tests need Playwright’s Chromium (`npx playwright install chromium`). If your machine already has a Chromium, point to it with `PW_CHROMIUM_PATH=/path/to/chromium`.

---

## Deploying (Supabase + Vercel)

**Automated (recommended):** with a Supabase access token and a Vercel token in the environment,
`ADMIN_EMAIL=you@agency.com npm run deploy` sets up everything below and deploys. `npm run live-check` then verifies the
live site end to end. See [docs/deployment.md](docs/deployment.md).

**By hand:**

### 1. Supabase project

1. Create a project at <https://supabase.com> (pick a region close to the team).
2. Apply the database migrations from this repo:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push            # applies supabase/migrations/*
   ```
   Don’t run `seed.sql` in production; it contains demo accounts.
3. **Authentication → Sign In / Providers:**
   - **User Signups → Allow new users to sign up: OFF.** This is a private tool.
   - Keep the **Email** provider **enabled**; it's also how teammates sign in.
4. **Authentication → Email Templates:** paste the HTML from `supabase/templates/` into **Invite user**, **Magic Link** and **Reset Password**. The links point to `/auth/confirm`, which verifies them on the server.
5. **Authentication → URL Configuration:**
   - **Site URL:** `https://<your-app-domain>`
   - **Redirect URLs:** add `https://<your-app-domain>/**`
6. Optional but recommended: **Authentication → SMTP Settings**, using your own email provider so invites come from your domain. Supabase’s built-in mailer is rate-limited.
7. Note these values from **Project Settings → API**: Project URL, `anon` key, `service_role` key.

### 2. Vercel

1. Import the GitHub repo in Vercel (framework: Next.js, default build settings).
2. Add the environment variables (Production and Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app-domain>` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key. Optional; enables in-app invites. Server-only, never prefix with `NEXT_PUBLIC_`. |

3. Deploy. Then set the Supabase **Site URL** (step 1.5) to the final domain if it changed.

### 3. First admin and teammates

1. In Supabase → **Authentication → Users → Invite user**, invite yourself. The **first account becomes the workspace admin** automatically.
2. Accept the invite email and choose a password. You land in the app.
3. In **Settings**, set the agency name, logo and default currency (used on share links and PDF reports).
4. Invite teammates from **Settings → Team** (if `SUPABASE_SERVICE_ROLE_KEY` is set) or from the Supabase dashboard. Everyone shares the same clients, funnels and templates.
5. To remove someone: **Settings → Team → Deactivate**. They’re signed out and can’t see anything. Reactivate them any time.
6. People added in Supabase with **Add user** (instead of an invite) start with no access until an admin activates them in Settings → Team.

---

## How it’s built

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4, with the prototype’s purple design (Bricolage Grotesque + DM Sans), light and dark.
- **Supabase:** Postgres with Row Level Security on every table, Auth (password, magic link, invites), and Storage (public `logos`; private `thumbnails` and `screenshots`).
- **Editor:** React Flow (`@xyflow/react`) with custom blocks, ports and edges; Zustand store with undo/redo.
- **Validation:** Zod. **Charts:** Recharts. **PDF:** jsPDF. **Alternative layout:** elkjs.

| Path | Contents |
|---|---|
| `lib/funnel-math.ts` | All funnel maths as pure functions, ported from the prototype: compute, offer/traffic values, warnings, sources, what-if, goal seek, forecast, planned vs actual |
| `lib/layout.ts` | “Tidy up” (the prototype’s algorithm) plus an ELK layered alternative |
| `lib/catalog.ts` | Block catalog: categories, defaults, ports |
| `lib/graph.ts` | Graph/settings types, Zod schemas, import/export (including prototype files) |
| `lib/templates.ts` | Built-in templates |
| `lib/editor/` | Editor store, autosave/offline drafts, labels |
| `components/editor/` | Canvas, blocks, inspector, reports, share/version/comment panels, exports |
| `supabase/migrations/` | Schema, access rules, storage, share-link functions |
| `tests/` | `unit/` (Vitest), `integration/` (database rules), `e2e/` (Playwright), `fixtures/` (numbers produced by the original prototype’s own code) |
| `reference/funnel-mapper.html` | The original single-file prototype |

The math tests run the **prototype’s own JavaScript** on its built-in templates (`npm run gen:fixtures`) and require the app’s results to match it node by node.
