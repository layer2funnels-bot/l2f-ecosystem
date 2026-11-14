# Whiteboard · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `misc6.js`.

## Shared components used

- Card / ruled panel (.card6)
- Dialog (.dlg)
- Context menu (.ctx)
- Form field (.field)
- Input with icon (.inp)
- Avatar (initials)
- App mark / plate
- Toast

## Dialogs and drawers (from the prototype source)

| Opening action id | Kind | Title |
|---|---|---|
| `wbfolder` | dialog | New folder |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything | — |
| `wbfolder` | New folder | New folder |
| `railmenu` | Apps | — |
| `wtool` | Arrow (A); Draw (P); Ellipse (O); Eraser (E); Hand (H); Image; Line (L); Lock; Rectangle (R); Select (V); Sticky note (S); Text (T) | — |
| `toast` | Comments; Export; Help; Library; Present; Share | — |
| `wz` | Zoom in; Zoom out | — |

## Keyboard and right-click (from the brief)

- - Home: sidebar All boards, Starred, Templates, **Folders** list (+ New folder); page: Folders cards, template strip (Blank, Funnel flow, Brainstorm, Mind map, Retro, Kanban), Recent boards grid (thumbnail, name, editors, edited). Right-click board: Open, Rename, **Move to folder…**, Duplicate, Star, Trash.

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
