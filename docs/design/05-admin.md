# 05 · Admin → Members and Access
File: `05-admin.html` · Status: approved with changes, applied

Visible to **Owner and Admin**. Everyone else gets the shared "We couldn't find that page" screen (identical to a page that doesn't exist).

**Members tab**: table (Person, Level, Status, Manage). Statuses: Active, Invited, Deactivated. "Invite someone" → dialog: email, level (Admin, Editor, Viewer), description of the level, "They'll see nothing until they accept." Manage → dialog: level, Deactivate, Remove, Cancel invitation (for invited). Confirmations name the effect: Remove "loses access straight away. Their work stays here." Deactivate "can't sign in until you turn them back on. Nothing is deleted."
Rules: the only owner can't be removed, deactivated or demoted ("An organization always needs one. Make someone else an owner first."). An admin can't change an owner ("Only an owner can change an owner.").

**Access tab** (three views):
1. **Levels**: matrix of 9 abilities × Owner/Admin/Editor/Viewer (✓ with hidden "Yes"/"No" text). Note: deny always wins; last owner can't be removed or demoted.
2. **Assignments**: Person · Access · Where (whole organization / app / client) · Comes from (Direct / Group) · Remove. "Add assignment" has a "Deny instead" option. Denials show a red "Denied" pill with ✗.
3. **Effective access**: pick a person → Area · Result (Can edit / Can view / No access, each with an icon) · Why (chips, e.g. "Group: Delivery team", "Denied on Drive", "Deny wins").

Mobile: tables become stacked rows with labels; dialogs full width with 16px margin. Keyboard: all actions are buttons; dialogs trap focus; Esc closes.

Tokens: `--panel --line --tint --success-tint --warn-tint --danger-tint --primary`.

Open assumptions: A1, A2, A5, A6, A10, A11.

Phone: the section menu becomes a bottom bar (see 10-shell-patterns §C).
