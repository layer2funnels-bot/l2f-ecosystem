# v7 defects fixed in V8 (with root causes)

Most v7 "layout" problems were styles from one app leaking into another because class names were reused across apps. **Claude Code must scope component classes per app** so these cannot return. Owner screenshots that show these: `06_SCREENSHOTS_AND_REFERENCES/owner-feedback-annotated/`.

| # | Where | Symptom | Root cause | V8 fix |
|---|---|---|---|---|
| 1 | Drive Home | Suggested cards dark navy, file names invisible | Funnel Mapper `.fcard` style applied globally | All Funnel Mapper styles scoped to `.fmpx` (build step `scope.py`), incl. its responsive rules |
| 2 | Drive Home | Blank orange square on the Slides chip; "PPT" misplaced | `.slides` (slide editor layout) hit the file-type tile | Tile rules reasserted |
| 3 | Drive sidebar | Storage showed a big blue block | Meter used `.bar` (styled as the 52 px app bar) | Scoped 6 px meter |
| 4 | Drive Home | Folder row cut by the section above | Card/folder margins and wrapping | Aligned folder grid |
| 5 | Projects task panel | Pink/green stretched ellipses in Subtasks, names cut | `.sub6 span{flex:1}` stretched the avatar | Selector narrowed |
| 6 | Projects sidebar | Contents wider than the sidebar | Filter tabs forced min-content width | Sidebar constrains its children |
| 7 | Projects top bar | Red blob in the timer pill | Agents recorder `.rec` leaked | Scoped |
| 8 | Projects top bar | Quick actions collapsed | Clients facts list `.qa` (grid) leaked | Scoped |
| 9 | Projects Home | Avatars on top of dates, clipped stacks | Hidden columns shifted the grid | Compact grid matches visible columns |
| 10 | Projects › Workload | Rows printed as run-on text | No CSS for the heat map | Heat map layout built |
| 11 | Office › Documents | Cards wrapping into 3 lines and overflowing | Narrow min width, wrapping meta | One-line names/meta, wider minimum |
| 12 | Office Home | Rows and source icons misaligned | Negative margins on the check button | Three-column row grid |
| 13 | Clients › Overview | Stage progress looked misaligned | "Current" used a 45 % gradient fill and a dark border | Single-baseline stepper |
| 14 | Office › Avatar (Clara, Marcus) | "undefined" in every section | Only John had sample content | Full sample content; pronouns follow the avatar |
| 15 | Office › Avatar | "All beliefs" button invisible | White text on white | Outline button on dark |
| 16 | Tasks | Gradient ended mid-page; list floated in a corner | Decorative background sized to content | Removed; wider sheet |
| 17 | Launcher | Client Portal alone on a row | Grid min width | Even grid (min 150 px) |
| 18 | Funnel Mapper › Clients | Names broken word by word | Flex wrap in a narrow card | Card grid |
| 19 | Client Portal | Nav links run together, badges overlap | Unstyled link row | Tabs with badges |
| 20 | Clients › Build | Checklist items on one line | Inline labels | Vertical checklist |
| 21 | Everywhere | "Funnel Mapper Pro" | Locked rename | "Funnel Mapper" in every UI string |
