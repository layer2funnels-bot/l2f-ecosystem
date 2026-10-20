# Decision register (Phase 4)

Recorded as implementation decisions, not owner approvals. Source: Phase 3 handoff and the Phase 4 working document. The Master Blueprint v1.2 and Decision Register were NOT present in the environment; where they exist, they take precedence and these must be reconciled.

| ID | Decision | Implemented as | Rationale | Blueprint check |
|---|---|---|---|---|
| D1 | Only owners transfer ownership, demote or remove an owner, or add an owner. Admins manage non-owner rows. A workspace must keep one active owner. | `mem_*` policies + `guard_last_owner` trigger | Prevents admin privilege escalation and orphaned workspaces | Pending |
| D2 | Editors delete only their own uploads. Client and project deletion needs admin. | `files_delete`, `clients_delete`, `projects_delete` | Limits accidental or hostile mass deletion | Pending |
| D3 | Editors see all clients in their workspace. Viewers read, cannot write. | `clients_*` policies | Matches "Editor access" default; per-client restriction can be added later without schema change | Pending |
| D4 | Editors request approvals; admins decide; requesters cannot approve their own request. | `approvals` policies | Separation of duties | Pending |
| D5 | Clients see only their own client record, projects, and files tied to that client. | `client_of()` in policies | Client isolation; no staff data | Pending |
| D6 | Brand Base answers: editors and above read and write; admins delete; viewers and clients have no access. | `bb_*` policies | Business-sensitive content | Pending |
| A1 | Auth identity read from `request.jwt.claim.sub`, the same claim Supabase's `auth.uid()` uses. | `current_user_id()` | Portable to Supabase without policy changes | Pending |
| A2 | Audit log is append-only; non-admins cannot read it. | no update or delete policy on `audit_events` | Tamper evidence | Pending |
| A3 | Denied and not-found return identical empty results (reads) and the same error code (writes). | RLS default behaviour; verified T4 | Prevents enumeration | Pending |
| A4 | Migrations disable function-body validation (`check_function_bodies = off`) so helper functions can precede the tables they query. | first line of migration 0001 | Required for SQL helpers referencing tables created later in the same file | Pending |
| A5 | Free-tier hosting: Cloudflare Pages (or Netlify free) for frontend, Supabase free for database. Vercel Hobby excluded (non-commercial terms). | Not deployed; see manual section 6 | $0 budget and commercial-use terms | Owner approval needed before any paid tier |

## Open items that need a business owner (not blocking the foundation)
- Whether a paid business tier is acceptable before real clients use the system (free tier pauses and has no backups).
- Owner confirmation of the blueprint defaults above, once the Master Blueprint is supplied.
