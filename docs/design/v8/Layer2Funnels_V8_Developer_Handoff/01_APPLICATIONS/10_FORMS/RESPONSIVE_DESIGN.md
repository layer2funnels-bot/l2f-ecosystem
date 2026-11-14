# Forms · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Forms (`#/forms/list`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/113_forms_list.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/113_forms_list.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/113_forms_list.jpg) |
| Builder (`#/forms/b/quiz`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/114_forms_b_quiz.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/114_forms_b_quiz.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/114_forms_b_quiz.jpg) |
| Responses (`#/forms/subs`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/115_forms_subs.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/115_forms_subs.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/115_forms_subs.jpg) |
| Templates (`#/forms/tpl`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/10_FORMS/168_forms_tpl.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/10_FORMS/168_forms_tpl.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/10_FORMS/168_forms_tpl.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
