# 07 · Shared states
File: `07-shared-states.html` · Status: approved with changes, applied

One wording and one layout per state, used by every app.
- **Loading**: placeholder rows that match the final layout (`aria-busy`). After a few seconds: "Still loading. This is taking longer than usual." + Try again. Buttons that save show "Saving…" and turn off.
- **Empty**: first use (plate-stack, "No offers yet", button only for people who can create) · no results ("No matches", Clear search) · nothing for you ("Nothing needs you right now"). If you can't create, no button and the text says who can.
- **Error**: page ("We couldn't load this. Your work is safe. Check your connection and try again." + Try again + "Details for support" with a short reference) · save ("Couldn't save. Your changes are still here. Try again.") · offline ("You're offline. You can keep reading. We'll save your changes when you're back.").
- **Not found = no access**: title "We couldn't find that", text "It may have moved, or you may not have access.", button "Go to Office Home". The screen for a missing record and a record in an organization you can't open is **identical** (the page checks this). No "access denied", no organization or owner names, same speed.
- **Read-only**: banner "Read only. {reason}. {what to do}." Reasons: your level is Viewer · item is archived · organization is paused. Fields look different but stay at 4.5:1. Turned-off buttons stay visible, stay focusable (`aria-disabled`) and explain why on press and in text beside them.

Colour is never the only signal: red has ✗, success has ✓, warning has a triangle.
Reduced motion removes pulse and fades. Targets ≥44px.

Tokens: `--danger(-tint) --warn(-tint,-text) --success-tint --line-soft --muted`.

Open assumptions: A14.
