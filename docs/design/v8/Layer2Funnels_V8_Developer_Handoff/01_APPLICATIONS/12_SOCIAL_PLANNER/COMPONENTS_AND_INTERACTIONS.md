# Social Planner · components and interactions

Visual specs for every component: `00_MASTER_DOCUMENTATION/01_DESIGN_SYSTEM.md` §6. Exact CSS: `08_PROTOTYPE_AND_SOURCE/prototype-source/` (later files override earlier: base → v4 → v5 → v6 → v7 → v8).

Prototype source files for this app: `studio5.js`.

## Shared components used

- Segmented switch (.vsw)
- Toggle
- Planner status (.kst)
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
| `fpub` | dialog | Publish form |
| `fovx` | dialog | Leave without saving? |
| `lstep` | drawer | — |
| `compose` | drawer | — |

Where the same action id appears in a v5 and a v6 file, the later file wins (that is what the prototype shows).

## Interaction catalogue (every action id found on this app's pages)

| Action id | Control labels using it | Opens |
|---|---|---|
| `msheet` | Apps and account | — |
| `sidetoggle` | Collapse sidebar | — |
| `usearch` | Search everything | — |
| `compose` | 3 myths about funnels; Behind the scenes; Case study: 41 booked calls; Client win: Sarah; Facebook Webinar reminder Mon 2 Nov; Funnel teardown #4; IG · 3 myths about funnels; IG · Behind the scenes; IG · Client win: Sara | drawer |
| `more` | More | More |
| `toast` | Connect; Send approved to GHL | — |

## Interaction rules that apply everywhere

- All navigation is a real link (Ctrl/middle-click open new tabs) — 02 §3.
- Right-click menus use the shared `.ctx` component: Escape closes, arrows move, long-press opens on touch.
- Every visible control works or is clearly marked "Later". The prototype's toasts and fake data are not product behaviour.
