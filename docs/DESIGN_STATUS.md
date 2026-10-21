# Screen design status (21 Oct 2026)

No approved screen designs exist in the repository yet (`UIUX_HANDOFF.md` is the brief for the design session). Every screen below is **built and working, but marked “Needs design”** in the product itself (a dashed amber note at the top of each screen; hide for demos with `showNeedsDesign: false` in `apps/web/config.js` or `SHOW_NEEDS_DESIGN=false` at build). When a design is approved, replace the screen’s markup and styles; the data flow, states and tests stay.

All screens use only the design tokens (`packages/ui/tokens.css`): colours, spacing, radii, focus ring, 44 px targets, three breakpoints, reduced motion. Neutral theme before sign-in; the organization’s theme after.

| Screen | Route | Status | States covered |
|---|---|---|---|
| Sign in | `#/signin` | Built, needs design | error (one plain line), offline, rate-limited, loading (button) |
| Create account | `#/signup` | Built, needs design | validation, existing-account (non-revealing), check-email |
| Check your email | `#/check-email` | Built, needs design | static |
| Forgot / reset password | `#/forgot`, `#/reset` | Built, needs design | non-revealing confirmation, expired link |
| Accept invitation | `#/invite` | Built, needs design | signed-out prompt, joining, failure (“can’t be used”), token stripped from URL |
| No workspace yet | `#/no-org` | Built, needs design | check again, sign out |
| Session expired | `#/expired` | Built, needs design | one token refresh attempted first |
| Launcher | `#/launcher` | Built, needs design | empty, coming soon, not built yet, Funnel Mapper Pro link tile, apps error |
| Shell (header, switcher, app menu) | all | Built, needs design | switching state, announcements, same-page / record-not-carried / page-unavailable / app-unavailable / refused / failed-retry notices |
| Office home | `#/office` | Placeholder, needs design | — |
| Funnels home | `#/office/funnels` | Built, needs design | loading, error + retry, counts of visible records only |
| Funnels lists (4) | `#/office/funnels/<type>` | Built, needs design | loading, empty (create or view-only wording), error, archived, client filter, audience chip |
| Funnels record (4) | `…/<type>/<id|new>` | Built, needs design | loading, error, not found (same as denied), saving, field errors by name, read-only (no permission / archived), share, archive, restore, delete |
| Other apps | `#/app/<key>` | “Not built yet” placeholder | coming soon |
| Admin → Members / Access / Apps, Clients, Projects, Drive, Planner, Portal | — | **Planned**, not started | — |

Gaps the design session should settle (found while building): where “Needs design” notes go once designs land; the Launcher tile layout when many apps exist; mobile navigation pattern (currently a wrapping link row); how a client-scoped permission is shown to a person who only holds it at client scope (the UI asks the organization-level answer today, so such a person sees fewer buttons than they may use); fonts (system fallback now; self-host Hanken Grotesk / Schibsted Grotesk / Newsreader at go-live — the CSP allows only `'self'` fonts).
