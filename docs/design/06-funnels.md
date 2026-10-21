# 06 · Office → Funnels
File: `06-funnels.html` · Status: approved with changes, applied

One pattern for four record types: **Avatars, Offers & products, Stories, Brand kits**. Sub-menu: Home · Avatars · Offers & products · Stories · Brand kits.

- **Home**: four count tiles; "Recently changed"; card **"Funnel maps"** stays as "Link design pending" (no data link designed).
- **List**: search, filter (Active / Archived / All), "New {type}" (Editor and up). Row: name + summary, Used in, Sharing (Internal / n client / Archived), Updated, Open, Archive or Restore.
- **Record (read)**: sections per type, "Internal notes · never shared" block, side cards "Shared with clients" (Stop sharing) and "Used in" (references only).
- **Edit / New**: name (required), summary, one text field per section, internal notes. Save / Cancel. Cancel or leaving with changes → "You have unsaved changes" (Save and leave / Discard and leave / Keep editing).
- **Share with a client**: pick a client, tick sections; Internal notes is disabled and unticked. Notice: "The Client Portal is locked for now. This saves the choice; nothing is visible to the client until the Portal is turned on."
- **Archive** dialog: "It disappears from lists and {client} can no longer see it. Nothing is deleted. You can restore it any time."
- **Restore**: immediate, toast "Restored."
- **Delete permanently** (archived items only): red warning "This can't be undone", type the record's name to enable the confirm.
- Not found / no access: shared screen.

Per type sections: Avatars (Who they are, Motivations, Objections, Language they use, Evidence) · Offers (Promise, Price and terms, What's included, Who it's for) · Stories (Type, The story, Where to use it) · Brand kits (Colours, Fonts, Voice and tone, Logo notes).

Who sees which buttons: Viewer = read only, no action buttons ("Read only. You can view this {type} but not change it."). Editor = New, Edit, Share, Archive, Restore. Admin and Owner = also Delete permanently. Switching organization while editing uses the approved unsaved dialog; from a record you land on the list with a note.

Mobile: table becomes stacked rows; the edit bar sticks to the bottom; targets ≥44px.

Tokens: `--panel --line --tint --primary --warn-tint (internal notes) --danger (delete) --success-tint`.

Open assumptions: A3, A4, A13, A14.

Phone: the section menu becomes a bottom bar (see 10-shell-patterns §C).
