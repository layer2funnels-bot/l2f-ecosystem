# Drive and editors · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `drive5.js`, `drive6.js`.

## Shared components used

- Segmented switch (.vsw)
- Toggle
- Empty state (.empty)
- Selection bar (.selbar)
- Right drawer / panel
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Avatar (initials)
- App mark / plate
- Progress ring
- Toast
- Pill / tag

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `ddel` | dialog | Move ${DRV.sel.size} item${DRV.sel.size>1?'s':''} to Trash? |
| `dnew` | dialog | Create new |
| `get` | drawer | — |
| `edpanel` | drawer | — |
| `dmove2` | dialog | Move to ${v}? |
| `edreset` | dialog | Reset to original? |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- file-details: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__file-details.jpg) (route `#/drive/home`)
- drive-new: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__drive-new.jpg) (route `#/drive/home`)
- drive-selection-bar: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__drive-selection-bar.jpg) (route `#/drive/home`)
- reset-to-original-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__reset-to-original-dialog.jpg) (route `#/drive/edit/image/hero`)
- drive-category-docs: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__drive-category-docs.jpg) (route `#/drive/home`)
- drive-category-images: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__drive-category-images.jpg) (route `#/drive/home`)
- drive-grid-view: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/05_DRIVE_AND_EDITORS__drive-grid-view.jpg) (route `#/drive/home`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything | — |
| `dtype` | All; Docs; Forms; Images; PDFs; Sheets; Slides | — |
| `noop` | Add text; Align; Align and spacing; Blank page; Bold; Borders; Checklist; Delete page; Draw; Extract pages; Fill form; Filter; Find and replace; Freeze; Highlight; Italic; Link (Ctrl K); Merge; Merge a PDF; More: striket | — |
| `dview` | Grid view; List view | — |
| `newfolder` | New folder | — |
| `dupload` | Upload | — |
| `dsel` | Select Ad creative, hero; Select Client onboarding SOP; Select Delivery timeline; Select Discovery call script; Select Kickoff deck; Select Q4 content calendar; Select Retainer agreement | — |
| `dstar` | Star | — |
| `dprev` | Details; PDF Retainer agreement | — |
| `more` | More | More |
| `railmenu` | Apps | — |
| `edp` | Chart; History; Table | — |
| `dshare` | Share | — |
| `edmenu` | Arrange; Data; Edit; File; Format; Help; Image; Insert; Page; Slide; Tools; View | — |
| `cmd` | Bold (Ctrl B); Bulleted list; Italic (Ctrl I); Numbered list; Underline (Ctrl U) | — |
| `edvoice` | Voice typing | — |
| `edtabs` | Tabs | — |
| `toast` | Before / after; Delete forever; Fit width; New tab; Restore; Save; Save as copy | — |
| `present` | Present | — |
| `slide` | 1 Layer2Funnels Kick-off Harry Kaye PT ·; 2 Layer2Funnels What we heard Busy mums ; 3 Layer2Funnels The plan Reel → quiz → r; 4 Layer2Funnels Timeline Copy by 24 Oct.; 5 Layer2Funnels Next steps Approve strat | — |
| `edorig` | Edited; Original | — |
| `edreset` | Reset to original | Reset to original? |

## Keyboard and right-click (from the brief)

- - **Move / Copy between Library and Personal [N]**: right-click a file/folder → Move to…, Copy to…, Move to Library, Move to Personal; dialog with folder tree of both spaces and a consequence note (Library: org owns, everyone in org can find; Personal: private, existing shares removed after warning; copy starts unshared); drag onto sidebar items asks the same confirm. Server-side, versions move with Move. Works for folders recursively.

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
