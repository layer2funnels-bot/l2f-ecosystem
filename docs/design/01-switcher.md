# 01 · Header and organization switcher
File: `01-switcher.html` · Status: **approved by owner** (with the two changes applied)

## Header (every app, every page)
Left to right: Launcher button · organization switcher · search · notifications bell · profile circle. A 4px bar in the organization's `--primary` sits above it. The active organization is always visible.
- Phone (<720px): switcher takes the first row, search drops to its own row, bell hides (reach it from the profile menu).
- Compact variant (editors/canvases): search becomes a 44px icon. Switcher stays.

## Menu
"YOUR ORGANIZATIONS": one row per organization (mark, name, your level). Current one shows ✓ "Current". An organization you can't join shows a lock and "No access". Footer: "Switching keeps you on the same page where it exists. Nothing is copied between organizations."

## Six outcomes (UX7)
Rules for all: stay in the same app · land on the equivalent page · never go to the Launcher on its own · old organization's data is cleared before the new one shows (enforced in the database) · screen reader is told the result.

| # | Situation | Result | Copy | Buttons |
|---|---|---|---|---|
| 1 | Same page exists | Content swaps. Toast. | "Now in Aurj · Projects" | none |
| 2 | Record exists only in the old organization | Land on that app's list | "That project belongs to Layer2Funnels, so it isn't here. We've taken you to the Projects list in Aurj." | Switch back to Layer2Funnels |
| 3 | App not turned on in the new organization | Stay in app, explanation panel | Title "Funnel Mapper Pro isn't turned on for Aurj". Body "You're now in Aurj. Funnel Mapper Pro is only set up for Layer2Funnels, so there's nothing to show here. Nothing from Layer2Funnels is on this screen." | Go to Aurj Office Home · Switch back to Layer2Funnels · text links: Ask an Aurj admin (**message only, tag "Needs backend later"**) · Browse all apps |
| 4 | You're not a member of the target | Nothing changes, menu stays open | "You're not a member of Aurj. Membership is by invitation only. Ask an Aurj owner to invite you. You're still in Layer2Funnels; nothing has changed." | none |
| 5 | Switch fails (connection drops) | Stay, nothing lost | "Couldn't switch to Aurj. The connection dropped before we could confirm your access. You're still in Layer2Funnels and nothing was changed or lost." | Try again · Dismiss |
| 6 | Unsaved changes | Dialog before switching | Title "Save your changes before switching?" Body "You have unsaved changes in Planner. They can't come with you to Aurj." Note "If saving fails, you stay in Layer2Funnels and your changes are kept." | Save and switch (default focus) · Discard and switch · Stay here |

## States
Closed · open · pending (spinner in the button, old content replaced by placeholders, button disabled) · error banner · dialog.

## Keyboard and mobile
Enter/Space opens; ↑/↓ move; Esc closes and returns focus to the button; Tab closes. Dialog traps focus, Esc = Stay here. Menu becomes a bottom sheet under 720px. Targets ≥44px. Animation (fade/slide 140–200ms, spinner, pulse) stops under reduced motion.

## Tokens
`--primary --on-primary --surface --tint --control-border --panel --line --muted --success(-tint) --warn(-tint,-text) --danger(-tint) --space-* --radius-md/lg --shadow-2`. Theme per organization via `data-theme="l2f|aurj"`.

## Open assumptions
A15 (membership is invitation-only; "Ask an admin" is message only).
