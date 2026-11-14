# Office · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `office5.js`, `office6.js`, `avatar5.js`, `funnels5.js`.

## Shared components used

- Table (.tbl6)
- Card / ruled panel (.card6)
- Tabs (.tabs6)
- Segmented switch (.vsw)
- Filter chips
- Toggle
- Document icon tile (.docic)
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Avatar (initials)
- Photo (circular)
- App mark / plate
- Progress bar
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `invite` | dialog | Invite someone |
| `addrel` | dialog | Add a relationship |
| `newavatar` | dialog | New customer avatar |
| `photoedit` | dialog | Profile photo |
| `avaddsec` | dialog | Add a chapter or section |
| `docsec` | dialog | New document section |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- invite-dialog: not captured automatically — open the prototype route and use the control (route `#/office/team`)
- new-avatar-dialog: not captured automatically — open the prototype route and use the control (route `#/office/avatars`)
- avatar-wizard-step2: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/01_OFFICE__avatar-wizard-step2.jpg) (route `#/office/avatar-new`)
- avatar-wizard-look: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/01_OFFICE__avatar-wizard-look.jpg) (route `#/office/avatar-new`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything | — |
| `oas` | Owner view; Team member view | — |
| `toast` | + Link an asset; Add a chapter; Add to strategy; Ask Office: “What are my tasks today?”, ; Chapter menu; Compare; Copy; Create offer; Drop Word or PDF files; Duplicate; Edit defaults; Export; Favicon; Insert linked asset | — |
| `oday` | Everything; This week; Today | — |
| `mdone` | Mark Approve email sequence v2 done; Mark Check GHL calendar sync done; Mark Draft Funnel Challenge day 3 email ; Mark Post update: 40 booked calls done; Mark Review quiz flow wireframe done; Mark Write results page copy | — |
| `noop` | Active; All; Anonymous only; Archived; Ask consent; Case study; Clients; Consent given; Customer journey; Funnel overview; Messaging direction; My projects; Offer and value; One-off; Origin story; Payment plan; Recurring | — |
| `more` | More | More |
| `railmenu` | Apps | — |
| `avstep` | Import a Word or PDF We read your resear; Start blank Choose a look, give it a nam | — |
| `avaddsec` | Add a section to the profile; Add chapter | Add a chapter or section |
| `jump` | 1. Market map; 10. What to do next; 11. Context notes; 2. Qualification; 3. Basic profile; 4. What drives him; 5. Beliefs; 6. External vs internal desires; 7. Best vs worst customer; 8. Problems, now and next; 9. Niche s | — |
| `sub` | Interview 5 real Johns from past clients; Join 3 communities and save the exact la; Print this profile and pin it near your ; Update to v1.1 with real quotes and obje; Watch 3–5 pieces from Hormozi, Brunson,  | — |
| `avsave` | Save | — |
| `chipt` | Ads; Both 1; Checkout; Clara; Clients 3; Emails; Everyone 8; John; Marcus; Sales page; Teammates 6; Webinar | — |
| `tpladd` | Add section | — |
| `tpldel` | Remove | — |
| `savedoc` | Save | — |
| `cmd` | Bold; Bullet list; Italic; Redo; Underline; Undo | — |
| `docsec` | New section | New document section |
| `adminas` | As admin; As owner | — |
| `invite` | Invite | Invite someone |
| `addrel` | Add relationship | Add a relationship |
| `tgl` | Admin pages; Approve posts; Archive objectives; Archive projects; Assign to others; Clients access; Create personal projects; Create projects; Delete clients; Delete for good; Delete objectives; Delete projects; Document | — |
| `cellt` | Client Portal: on; Forms: on; Funnel Mapper: off; Funnel Mapper: on; Layer 2 Agents: off; Layer 2 Agents: on; Planner: off; Planner: on; Projects: on; Social Planner: off; Social Planner: on; Tasks: on; Value Ladder: off | — |

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
