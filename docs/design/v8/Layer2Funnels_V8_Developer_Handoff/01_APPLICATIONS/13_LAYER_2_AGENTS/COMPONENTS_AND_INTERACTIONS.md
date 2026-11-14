# Layer 2 Agents · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `more5.js`.

## Shared components used

- Segmented switch (.vsw)
- Toggle
- Empty state (.empty)
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

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything | — |
| `recstart` | Start recording | — |
| `toast` | Join a Zoom call; Rename speaker; → Task | — |
| `tgl` | Action items to Tasks; Audio (MP3); Meeting notes; Transcript | — |
| `sub` | (icon) | — |

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
