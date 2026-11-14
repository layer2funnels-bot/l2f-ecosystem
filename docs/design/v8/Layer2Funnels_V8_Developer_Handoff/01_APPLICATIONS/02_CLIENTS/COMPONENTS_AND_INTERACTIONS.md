# Clients · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `clients6.js`.

## Shared components used

- Table (.tbl6)
- Card / ruled panel (.card6)
- Tabs (.tabs6)
- Segmented switch (.vsw)
- Toggle
- Client status (.cpill)
- Planner status (.kst)
- Document icon tile (.docic)
- Empty state (.empty)
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Stage stepper
- Avatar (initials)
- App mark / plate
- Progress bar
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `(inline)` | dialog | Why was ${c.n} lost? |
| `newclient` | dialog | New client |
| `newreq` | dialog | New request |
| `newsop` | dialog | New SOP |
| `cfolder` | dialog | New folder |
| `addtab` | dialog | Add a section |
| `addsection` | dialog | Add to Strategy |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- new-client-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/02_CLIENTS__new-client-dialog.jpg) (route `#/clients/list`)
- new-request-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/02_CLIENTS__new-request-dialog.jpg) (route `#/clients/requests`)
- clients-grid-view: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/02_CLIENTS__clients-grid-view.jpg) (route `#/clients/list`)
- clients-pipeline-view: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/02_CLIENTS__clients-pipeline-view.jpg) (route `#/clients/list`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `newclient` | Add lead; New client | New client |
| `usearch` | Search everything | — |
| `cview` | Grid; Pipeline; Table | — |
| `toast` | Add a form; Add group; Client sharing; Create revision; Edit; Make a task; Mark approved; More; Remove; Save stages; Send; Send reminder; Update progress; Upload; Whiteboard; Withdraw | — |
| `addtab` | Section | Add a section |
| `newreq` | Ask for more info; New request; Request something; Send for approval | New request |
| `addsection` | Add a section; Add a section e.g. Lead magnets, Ad angl | Add to Strategy |
| `avimport` | Upload Word or PDF | — |
| `cfolder` | New folder | New folder |
| `noop` | All; Approved; New replies; Waiting on client | — |
| `newsop` | New SOP | New SOP |
| `stgsteps` | Steps & sections | — |
| `addstage` | Add a stage | — |
| `tgl` | A client approves or asks for changes; A client is idle for 7 days; A client replies to a request; A client submits a form; A client uploads a file; Shown to client | — |

## Keyboard and right-click (from the brief)

- | All clients | [R] | Title + hint. Toolbar: search, Open / Past and lost / All, stage filter, view switch **Table (default) · Grid · Pipeline**. Remember the user's last view per device, but first visit = Table. Table: client (initial tile, **name 14.5 px**, business), status pill, stage, lead, next action + due, value. Grid: cards with stage segments. **Pipeline**: columns **Lead, Proposal, Active, Paused, Past, Lost** with count and value; drag cards between columns (non-drag: right-click "Move to…", status select on the client page); moving to Lost asks a reason (Price / Chose another provider or an AI tool / Timing / No reply). |

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
