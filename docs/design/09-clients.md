# 09 · Clients app
File: `09-clients.html` · Status: delivered, awaiting owner approval

Main menu (4): **Clients · Requests & Approvals · SOPs & Tools · Settings** (Settings only for Owner and Admin). Phone: bottom bar (see 10). Header and switcher as in 01. Pipeline is a view inside Clients, not a menu item.

## Clients list
- Title "Clients", sub "Everyone you're delivering for." Button **New client** (Owner, Admin, Editor).
- Search + filters: Show (Open / Closed / Archived / All, default Open), Stage, Account lead. View switch: **Table · Grid · Pipeline**.
- **Table** columns: Client (name, business), Status, Account lead, Stage, Next action (+due), Open requests. Phone: stacked rows with labels.
- **Grid** card: initial, name, business, status pill, lead, five-bar stage progress (text alternative "Stage 2 of 5: Strategy"), next action, open-request pill.
- **Pipeline**: five columns (Brand Base → Strategy → Copy → Build → Marketing) with counts. Phone: a stage selector and one column.
- Statuses: Intake · Onboarding · Active (✓) · Paused (warning) · Closed · Archived.
- Empty: first use "No clients yet / Add your first signed client to start delivery." (button only if you can create); filtered "No matches / Try different filters, or clear them." + Clear filters.

## New client (dialog)
Client name (required), Business, Main contact name, Contact email, Account lead. Hint "They start in Brand Base. Nothing is shared with the client yet." Creates the client (status Intake) and opens its Overview.

## Client record
Header: initial, name, business · account lead, status, current-stage pill, scoped-access chip when relevant. Buttons: **Share with client**, **Edit details** (Owner, Admin, Editor, scoped Editor), **Archive** (Owner, Admin). Archived: banner + **Restore** (Owner, Admin) + **Delete permanently** (Owner, Admin).
Five tabs: **Overview · Work · Requests & Approvals · Documents & Brand Kit · Team Notes** (scrolling strip on phones, selected tab underlined).

**Overview**: six-milestone journey (Signed + five stages; done/current/upcoming), then Next action (owner, due, "Open this step"), Waiting on the client, Updates for the client (what the Portal shows; "Post an update"), Needs attention, Latest decision, Team, Recent activity (team only).

**Work**: stage selector (five pills, ✓ on done). Each stage: steps with owner, status (Not started / In progress / Done), due date, optional client-action button (Request information · Send for approval · Share update), link "Open in Drive" to the protected SOP, tool buttons for authorized apps, and **Mark {stage} complete** (confirms it updates the Portal milestone with time and next step). **Build** is a progress page only: heading, one sentence "The build happens in the client's ClickFunnels or GoHighLevel account. This page just shows progress.", progress bar, status. No tools, plans, asset lists, links or checklists.

**Requests & Approvals**: table (Request, Stage, Status, Version, Sent). Statuses: Waiting on client · Responded · Reviewed · Approved · Changes requested · Draft. Detail dialog shows type, stage, **exact version**, and two separate boxes: Internal review / Client approval. Buttons by state: Mark as reviewed (Responded) · Create revision v+1 (Approved, Changes requested; earlier decision stays on record) · Send reminder (**message only, "Needs backend later"**) and Cancel request (Waiting). **New request**: type (Information request / Approval), stage, title (required), message, file+version (approvals only), note "The client sees only this message (and the file, for approvals). The Client Portal is locked for now, so it's saved but not visible yet."

**Documents & Brand Kit**: Brand Kit card (Approved vX badge, colours, fonts, "19 of 27 questions answered, in 6 sections", Send follow-up questions). Files table: file, version, owner, visibility (Internal / Shared with client), Share or Stop sharing with a confirm that names the exact version. "Add file" opens the shared file picker.

**Team Notes**: banner "Team only. Never shown to the client, in the Portal or in client messages." Add note + Pin, Pinned section, notes list, Pin/Unpin, Delete (author or admin).

**Share with client (dialog)**: Portal contacts (Invite / Invited), "What the client can see" list (milestones, requests/approvals, updates always; files shared one by one; team notes never). Notice: Portal locked, invitations saved and go out when an owner turns it on.

**Archive**: "It disappears from lists and the client's Portal access is paused. Nothing is deleted. You can restore it any time." **Delete permanently**: archived clients only, red warning "This can't be undone. It removes the client, their files, team notes, requests and approval history.", "Export first" (**Needs backend later**), type the name to confirm.

## Other pages
- **Requests & Approvals (all clients)**: same table with a Client column; scoped users see only their client.
- **SOPs & Tools**: five SOPs (one per stage) linked to Drive, never copied; tools list by level.
- **Settings** (Owner, Admin): five fixed stages, step counts, "Updates Portal milestone: Yes", Edit steps dialog (Build has none).

## States, mobile, keyboard
Read-only banner for Viewer. Client-scoped users: banner "Your access: Editor on one client", one client only, no totals. Not found = shared screen. Switching organization from a record lands on the list with "That client belongs to {org}, so it isn't here." Tables stack on phones; dialogs full width; every control ≥44px; dialogs trap focus, Esc closes; tabs are real `role=tab`. Reduced motion respected.

Tokens: `--primary --tint --panel --line(-soft) --success(-tint) --warn(-tint,-text) --danger(-tint) --shadow-1/2`.

Open assumptions: A17–A25.

Phone: the section menu becomes a bottom bar (see 10-shell-patterns §C).
