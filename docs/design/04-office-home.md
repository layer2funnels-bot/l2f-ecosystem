# 04 · Office Home
File: `04-office-home.html` · Status: approved with changes, applied

Page: Office header + menu (Home, Planner, Projects, Funnels, Documents, Team, Apps, Admin; one "Planner" slot, never "Plans"). Title "Home", sub "Your work in {organization}."

Blocks: 
- "Coming up" notice (amber, clock icon) when something is due soon.
- **Needs your attention**: approvals and reviews. Row = title, context · due date, type pill, Open button.
- **My work**: row = title, context · due date, status pill (Not started, In progress, Planned).
- **Deadlines**, **Recent updates** ("Only from things you can open."), **Shortcuts** (Planner, Projects, Funnels, Documents).
- **For owners and admins**: invitations waiting, Client Portal locked status. Editors don't see this card.

Empty ("Quiet day") copy: "Nothing needs you right now. Approvals and reviews assigned to you show up here." · "Nothing assigned to you. When someone gives you a task in {org}, it appears here with its due date." · "No deadlines in the next two weeks." · "No updates yet today."

Layout: two columns (2:1) above 900px, one column below. Every row shows owner/context, status and due date. Only records the viewer may open appear (counts and updates too).

Tokens: `--panel --line-soft --warn-tint --success-tint --tint --primary --space-*`.

Open assumptions: A9.

Phone: the section menu becomes a bottom bar (see 10-shell-patterns §C).
