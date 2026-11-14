# Planner · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `planner6.js`.

## Shared components used

- Table (.tbl6)
- Card / ruled panel (.card6)
- Tabs (.tabs6)
- Segmented switch (.vsw)
- Planner status (.kst)
- Empty state (.empty)
- Right drawer / panel
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- App mark / plate
- Progress bar
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `plfa` | dialog | Focus area |
| `plobjnew` | dialog | New objective |
| `plnewplan` | dialog | Plan |
| `plnewstrat` | dialog | New strategy |
| `pltw` | dialog | Turn into work |
| `plkpi` | dialog | Add KPI |
| `plreading` | dialog | Record reading |
| `(inline)` | drawer | — |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- objective-drawer: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/06_PLANNER__objective-drawer.jpg) (route `#/planner/plan/map`)
- planner-new-plan-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/06_PLANNER__planner-new-plan-dialog.jpg) (route `#/planner/plans`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything | — |
| `plcreate` | Create | — |
| `plneeds` | Needs you 1 | — |
| `toast` | + KPI; + Objective; + Sub; + Task; Add; Add sub-objective; Create a plan from it; Export; First 1000 Followers on Facebook; More; New KPI type; Save vision; Schedule a review | — |
| `pobj` | 0%; 30%; 40%; Daily live sessions; Daily live sessions 5 Days Post Challeng; Draft day 1–2 posts; Launch the challenge page; Launch the challenge page 5 Days Post Ch; Line up 3 guest coaches; Package the DFY offer; Packa | — |
| `more` | More | More |
| `plmyl` | Board; List | — |
| `chipt` | Due this week; Hide completed; Overdue | — |
| `plnewplan` | Edit plan details; New plan | Plan |
| `plan2proj` | Create a project from this plan | — |
| `planmenu` | Plan actions | — |
| `plfa` | Add focus area; Edit; Focus area | Focus area |
| `plview` | Board; List | — |
| `plobjnew` | Add objective | New objective |
| `pltw` | Turn into work | Turn into work |
| `almode` | Objectives of one plan; Plans | — |
| `alall` | Expand all | — |
| `alz` | Zoom in; Zoom out | — |
| `altg` | Collapse; Expand | — |
| `plrt` | All objectives; Metrics; Summary | — |
| `stratmenu` | First 1000 Followers on Facebook | — |
| `plnewstrat` | New strategy | New strategy |
| `strat2proj` | Create a project from it | — |
| `sbz` | Fit; Zoom in; Zoom out | — |
| `sbcollapse` | Collapse all | — |
| `sbfocus` | Focus on this area | — |
| `sbcol` | Collapse | — |
| `snsel` | GOAL Launch the challenge page TR Not st; GOAL Package the DFY offer TR Not starte; GOAL Write 5 Days Posts TR On track 1 1 ; INITIATIVE Daily live sessions TR Not st; INITIATIVE Line up 3 guest coaches UM On; INITIATIVE | — |

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
