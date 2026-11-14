# Accessibility and usability review prompt · paste into Claude Code

For the app just built (or all apps in P14):
1. Keyboard: every action reachable with Tab/Shift-Tab/Enter/Space/Escape/arrows; visible 2 px focus ring; focus returns to the opener when a dialog/drawer closes; shortcuts from the briefs work and are listed in the help dialog.
2. Screen readers: icon-only buttons have `aria-label`; tabs use `role=tab` + `aria-selected`; dialogs `role=dialog` + `aria-modal` + labelled title; live region for toasts; status never conveyed by colour alone (word + dot).
3. Contrast: text ≥4.5:1 (≥3:1 for 24 px+), including muted labels and text on brand yellow; check light and dark, L2F and Aurj.
4. Targets: ≥44 px on touch; ≥32 px pointer.
5. Motion: `prefers-reduced-motion` turns off launcher motion, tilt, confetti, transitions.
6. Language: Urdu text uses `dir="rtl"` and Noto Nastaliq Urdu; mixed text wraps correctly.
7. Usability heuristics per page: clear primary action, no dead ends, undo for destructive actions (toast Undo or confirmation), errors in plain words with Retry.
Output `docs/implementation/<APP>_A11Y_REVIEW.md` with issues (severity, page, fix) and fix them.
