# Office · features and functionality

Status marks: **[E]** existing, keep · **[R]** redesigned (same function, new design) · **[N]** new, build it · **[F]** future, do not build (show "Later" only where stated). Functions are unchanged from v7; V8 changes only the visual design (section 3).

## 1. Change register for this app (what the repo does not have yet)

- [N] Customer Avatar: new list cards, **New avatar wizard** (import Word/PDF → read → map sections → choose one of 10 3D looks → name), **edit mode** for every chapter, add sections, Use it and Evidence explained.
- [N] Offers & Products: full **New offer** page. [N] Stories: **New story** page.
- [N] **Brand Kits** (many, not one): list, new, detail.
- [N] **Default strategy template** editor (applies to new strategy documents only).
- [N] Documents: **custom sections** with upload/new document per section.
- [N] Admin: People (teammates + clients), **Teammate access** (app on/off + level + feature switches), **Client access** matrix (owner only), Roles, **Access review** (explained), **Storage & version rules** per file type, **Branding**, Audit log; "As owner / As admin" difference.
- [N] Home "My day" across Projects, Tasks, Planner; "Waiting on you"; org pulse (built in v5, keep).

## 2. Full functional brief (authoritative, carried over from v7 unchanged except the Funnel Mapper rename)

### Office · implementation brief

Repo: `apps/web/js/views/office.js`, `funnels.js`, `strategies.js`, `admin.js`, `home.js`, `profile.js`; modules `docs.js`, `drive.js`. Prototype: `office5.js`, `office6.js`, `avatar5.js`, `funnels5.js`. Routes below are prototype hashes (`#/office/...`); keep the repo's routing scheme.

#### Navigation [R]
Sidebar: Home · Projects · Funnels (children: Overview, Customer Avatars, Offers & Products, Stories, **Brand Kits**, Funnel Strategies) · Documents · Team · Apps · Admin. Planner is **not** in the Office menu (it is its own app). Sizes per v7 (15 px items, 40 px rows).

#### Pages
| Page | Route | Status | Notes |
|---|---|---|---|
| Home | office/home | [R] | Approved, keep sizes. Greeting + summary sentence; "Owner view / Team member view" switch (member hides pulse/finance); Ask bar (disabled, "Assistant · later"); **My day** (one list from Projects, Tasks, Planner with source plate; Today / This week / Everything; tick completes in source app); **Waiting on you** (client approvals, social approvals, doc reviews); What's happening feed (filter All/My projects/Clients); right column: Plans and goals (Planner rollup ring + focus areas bars), Projects (live, status pill, progress), Client pipeline counts (owner), Team today (who works on what, hours bar), Organization health (owners: invitations, storage, portal state). |
| Projects | office/projects | [E] | Cards of live projects, link to Projects app. |
| Funnels overview | office/funnels | [E] approved | Flow: Avatars → Offers → Stories → Brand Kits → Strategies → Map it (Funnel Mapper). |
| Customer Avatars list | office/avatars | [R] | Grid of cards (min 230 px): 3D figure on the avatar's colour, version + status badge, name, sub-name, role, completeness ring, updated; last card "New avatar". Search + Active/Archived/All. |
| New avatar | office/avatar-new | **[N]** | Wizard, 5 steps shown as a stepper: **1 Start**: two cards, "Import a Word or PDF" (drop zone .docx/.pdf ≤20 MB) or "Start blank". **No short/full choice.** **2 Read the file**: progress steps (Reading, Finding sections and tables, Matching to chapters), file name + word count + sections found. **3 Check the sections**: table "From your file → Goes to chapter (select) · Confidence (High/Medium/Low) · Items"; unmatched text can become a custom section or be skipped. **4 Choose a look**: grid of **10 3D avatars** (prototype `AVPICK`: colour, skin, hair, shirt, hair style); selected has a 2 px ring. **5 Name it**: name*, short description, role, market, used for (organization or a client) + live preview → Create (confetti) → profile. Import parsing is **backend [N]**: extract headings, tables, lists from DOCX (mammoth/docx-io already in repo) and PDF text; map by heading keywords to chapter keys; keep original file attached as evidence. |
| Avatar profile | office/avatar/:id | [R] approved | Short profile: left cards (At a glance, Where he is now, Pays for), centre 3D stage (orbit fact chips, version badge, breathing/blink, pointer tilt), right cards (Wants, Scared of, Where to reach), funnel tags; Root belief dark band; One-line version with Copy; **"Add a section to the profile"** dashed button. Top bar: title, version/status, completeness ring, Export (PDF/Word), **Edit**. Tabs: Profile · Full profile · Use it · Evidence. |
| Full profile | …/deep | [R] | 11 chapters with left chapter index (completeness rings), each chapter heading has an edit pencil → edit mode at that chapter. Chapters: Market map, Qualification (3 questions), Basic profile, What drives him, Beliefs (table with True/False/Cultural verdict), Desires (external vs internal), Best vs worst customer, Problems now/next, Niche statement (full/compact/one line, copy), What to do next (checklist, "→ Task" sends to Tasks Inbox), Context notes. "Add a chapter". |
| Edit mode | …/edit/:chapter | **[N]** | Focused page: chapter list (drag to reorder, Add chapter), editable chapter heading, "Show a summary on the profile" checkbox, chapter body editor by type: table rows (drag, add, delete, verdict select), key-value fields (with "Show on profile"), or rich text. Header: Unsaved changes indicator, Cancel, Save. **One data model**: the short profile renders selected fields/summaries from the same chapters, so edits update both. Add chapter dialog: heading + layout (List, Table, Quotes, Key facts, Free text, Checklist) + show on profile. |
| Use it | …/use | [R] | Explained line on top. Cards: Hook (external desire), Story (internal desire), Objection (false belief), Proof (best trait), Channel, Filter question; each shows its source chapter; Copy; "Add to strategy" inserts into a chosen funnel strategy doc. |
| Evidence | …/evidence | [R] | Explained line. Confidence list (interviews 2 of 5, quotes saved, assumptions), Draft warning, "Log an interview", Versions with Compare. |
| Offers & Products | office/offers, office/offer/:id | [E]/[R] | Cards and detail as built. |
| New offer | office/offer-new | **[N]** | Focused form page with numbered sections + sticky live preview: 1 Basics (name*, type Service/Course/Coaching/Digital/Physical, status Draft/Active, one-line promise) · 2 Price and terms (price, currency, One-off/Recurring/Payment plan, guarantee, delivery time) · 3 What's included (sortable list, bonuses) · 4 Who it's for (avatars multi-select chips, Value Ladder step) · 5 Internal notes (never shared). Buttons Cancel / Save draft / Create offer. Same component is reused in Clients › Strategy › Offers. |
| Stories | office/stories | [E] | |
| New story | office/story-new | **[N]** | Type Case study/Testimonial/Origin; headline*; who (client/org); story; before/after; best quote; permission (Consent given/Ask consent/Anonymous) + attach consent; where to use (chips). |
| Brand Kits | office/brandkits, brandkit/:id, brandkit-new | **[N]** (was one kit) | List cards (colour strip, name, fonts, "Main" badge). Detail = existing brand kit view + Duplicate + Edit. New/edit form: name*, belongs to (org/client), logos (light + dark drop zones, icon/favicon), colours (role, hex, add/remove), fonts (heading/body + sample), voice (words, we say / we never say), assets upload. |
| Funnel Strategies | office/strategies, strategy/:id | [E] approved | Add "Default template" button. Strategy doc keeps Link assets + map linking (Funnel Mapper). |
| Default strategy template | office/strategy-template | **[N]** | Sortable sections (heading + helper text), add/remove, preview, versions. **Applies to new documents only**; existing documents keep their headings (store `template_version` on each doc). |
| Documents | office/documents | [R]+**[N]** | Sections (Approved SOPs, Policies, Templates + **custom**). "New section" dialog: name, who can see (everyone/admins), owner protected. Each section: New document, Upload (Word, PDF, Excel, images), drop zone, ⋯ (rename, move, visibility, delete). Files live in Drive; sections are folders with metadata. |
| Team, Member | office/team, office/member/:k | [E] | Cards with cover and photo; member page: working on now, pending work (only what viewer may see; private as count), activity, week hours, about, projects. |
| Apps | office/apps | [E] | |
| Admin | office/admin/{people, teammates, clients, roles, review, storage, branding, audit}, person/:k | **[N]** most | See `03_PERMISSIONS…` for rules. People table (relationship chips Teammate / Client / both, role, apps count, status, last active; client contacts listed too). Person page: relationships cards (+ Add relationship), **App and feature access** accordion (toggle on/off, level select, "N features" → feature switches with "From role / Off by role" labels, Save access / Reset to role), **Check access** panel. Client access: matrix clients × 10 client apps (owner editable, admin read-only notice), Edit defaults. Roles matrix. Access review (with explanation box). Storage (usage bar + legend, largest files, rules per type, settings). Branding (02 §8). Audit log. Prototype has an "As owner / As admin" switch to show the difference; in the product this comes from the real role. |
| Notification settings | office/settings | [N] | Same table as profile › Notifications. |

#### Data [N]
`avatars(id, workspace_id, client_id?, name, subtitle, role, look jsonb, version, status, completeness)`, `avatar_chapters(avatar_id, key, heading, layout, position, show_on_profile, content jsonb)`, `avatar_sources(avatar_id, file_id, mapping jsonb)`; `offers` (existing) + fields above; `stories` + consent fields; `brand_kits(id, workspace_id, client_id?, name, is_main, logos, colours jsonb, fonts, voice jsonb)`; `strategy_templates(workspace_id, version, sections jsonb)`; `doc_sections(id, workspace_id, name, visibility, owner_protected, folder_id, position)`; permissions tables from 03.

#### Acceptance
- No "short or full" question anywhere; import → mapping → look → profile works end to end with a real DOCX.
- Editing a belief in edit mode changes it in Full profile and, if summarized, on Profile.
- Multiple brand kits; strategy template change affects only new docs.
- Admin cannot change client access; owner can; server rejects forbidden calls (test with direct API).
- Sections never touch: ≥18 px between stacked cards on every Office page; Home and Funnels font sizes unchanged.


## 3. What V8 changes visually (no functional change)

- Home "My day" and "Waiting on you" are a three-column row grid (check · task + source · when) with hairline separators instead of floating rows.
- Greeting title 30 px (v7 56 px display).
- Documents: section header on its own rule; document cards one line (name + meta never wrap), min width 260 px; drop zones align with cards.
- Team: gradient cover banners removed; quiet people grid.
- Avatar studio cards: flat, sentence-case headings; Clara/Marcus sample content complete; pronouns follow the avatar ("Where she is now").
- Root-belief band: "All beliefs" is an outline button on dark (v7 was white text on white).
