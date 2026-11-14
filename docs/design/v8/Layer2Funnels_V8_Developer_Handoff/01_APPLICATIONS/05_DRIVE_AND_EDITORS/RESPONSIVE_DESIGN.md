# Drive and editors · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Confirmed in the brief

- - No rail, no app sidebar, no second header (fixes "two stacked bars" and wasted space). Menus open dropdowns with the real menu items (see EDITORS_DESIGN_BRIEF). Overflow toolbar items move into "⋯" at narrow widths; phone: menus collapse into one Menu button.
- - **Ruler [N]**: horizontal ruler above the page (sticky), inches/cm by locale, ticks every 1/8, numbers each inch, grey margin zones, **draggable left/right margin markers (blue triangles), first-line indent marker, tab stops** (click to add, drag off to remove). Vertical ruler on the left showing top/bottom margins (hidden < 1000 px). Rulers reflect the page setup (A4/Letter, margins) and the current paragraph's indents. View › Show ruler toggles it.
- - Docs ruler margins change the page margins; tab stop affects Tab key; ruler hides in phone width.

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Home (`#/drive/home`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/092_drive_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/092_drive_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/092_drive_home.jpg) |
| Library (`#/drive/mydrive`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/093_drive_mydrive.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/093_drive_mydrive.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/093_drive_mydrive.jpg) |
| Personal (`#/drive/personal`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/094_drive_personal.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/094_drive_personal.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/094_drive_personal.jpg) |
| Docs editor (`#/drive/edit/doc/sop`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/095_drive_edit_doc_sop.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/095_drive_edit_doc_sop.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/095_drive_edit_doc_sop.jpg) |
| Sheets editor (`#/drive/edit/sheet/cal`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/096_drive_edit_sheet_cal.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/096_drive_edit_sheet_cal.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/096_drive_edit_sheet_cal.jpg) |
| Slides editor (`#/drive/edit/slides/deck`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/097_drive_edit_slides_deck.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/097_drive_edit_slides_deck.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/097_drive_edit_slides_deck.jpg) |
| Image editor (`#/drive/edit/image/hero`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/098_drive_edit_image_hero.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/098_drive_edit_image_hero.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/098_drive_edit_image_hero.jpg) |
| PDF editor (`#/drive/edit/pdf/prop`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/099_drive_edit_pdf_prop.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/099_drive_edit_pdf_prop.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/099_drive_edit_pdf_prop.jpg) |
| Delivery My Drive Delivery (`#/drive/f/delivery`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/158_drive_f_delivery.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/158_drive_f_delivery.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/158_drive_f_delivery.jpg) |
| Recent (`#/drive/recent`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/159_drive_recent.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/159_drive_recent.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/159_drive_recent.jpg) |
| Starred (`#/drive/starred`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/160_drive_starred.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/160_drive_starred.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/160_drive_starred.jpg) |
| Shared with me (`#/drive/shared`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/161_drive_shared.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/161_drive_shared.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/161_drive_shared.jpg) |
| Trash (`#/drive/trash`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/05_DRIVE_AND_EDITORS/162_drive_trash.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/05_DRIVE_AND_EDITORS/162_drive_trash.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/05_DRIVE_AND_EDITORS/162_drive_trash.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
