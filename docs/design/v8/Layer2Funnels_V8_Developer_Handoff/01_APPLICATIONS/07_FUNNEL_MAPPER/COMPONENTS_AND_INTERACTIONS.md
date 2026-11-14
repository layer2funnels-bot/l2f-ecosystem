# Funnel Mapper · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `fmp6.js`.

## Shared components used

- Toggle
- Planner status (.kst)
- Empty state (.empty)
- Dialog (.dlg)
- Form field (.field)
- Input with icon (.inp)
- Funnel block (FM)
- App mark / plate
- Progress ring
- Toast

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `fnewfunnel` | dialog | New funnel |
| `fnewclient` | dialog | New client |
| `fshare` | dialog | Share funnel |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Captured overlay states (desktop 1440)

- fm-new-funnel-dialog: [screenshot](../../06_SCREENSHOTS_AND_REFERENCES/v8/overlays-1440/07_FUNNEL_MAPPER__fm-new-funnel-dialog.jpg) (route `#/fmp/funnels`)

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps | — |
| `fsearch` | Search clients, funnels, templates… ⌘K | — |
| `fnewclient` | New client | New client |
| `fnewfunnel` | Application funnel 5–8 blocks · sample n; Challenge funnel 5–8 blocks · sample num; New funnel; New funnel from a template; Quiz funnel 5–8 blocks · sample numbers; Subscription funnel 5–8 blocks · sample ; Tripwire funn | New funnel |
| `toast` | Delete forever; Layers; Present; Restore; Share portfolio; Tidy up | — |
| `fctab` | Details; Funnels 3; Notes; Products 3 | — |
| `chipt` | All 11; Archived 1; Draft 4; Live 4; Needs attention; Proposed 2 | — |
| `railmenu` | Apps | — |
| `fshare` | Share | Share funnel |
| `fview` | Clean; Performance | — |
| `fins` | Model; Simulate; Track | — |
| `fstab` | Account; Appearance; Independent accounts; Profile; Team; Workspace & branding | — |

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
