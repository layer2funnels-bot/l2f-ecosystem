# Funnel Mapper · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Home (`#/fmp/home`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/069_fmp_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/069_fmp_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/069_fmp_home.jpg) |
| Clients (`#/fmp/clients`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/070_fmp_clients.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/070_fmp_clients.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/070_fmp_clients.jpg) |
| Client (`#/fmp/client/sc`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/071_fmp_client_sc.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/071_fmp_client_sc.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/071_fmp_client_sc.jpg) |
| Funnels (`#/fmp/funnels`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/072_fmp_funnels.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/072_fmp_funnels.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/072_fmp_funnels.jpg) |
| Editor (`#/fmp/funnel/pt`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/073_fmp_funnel_pt.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/073_fmp_funnel_pt.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/073_fmp_funnel_pt.jpg) |
| Reports (`#/fmp/funnel/pt/reports`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/074_fmp_funnel_pt_reports.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/074_fmp_funnel_pt_reports.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/074_fmp_funnel_pt_reports.jpg) |
| Templates (`#/fmp/templates`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/075_fmp_templates.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/075_fmp_templates.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/075_fmp_templates.jpg) |
| Trash (`#/fmp/trash`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/076_fmp_trash.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/076_fmp_trash.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/076_fmp_trash.jpg) |
| Settings (`#/fmp/settings`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/077_fmp_settings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/077_fmp_settings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/077_fmp_settings.jpg) |
| Help & shortcuts (`#/fmp/help`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/07_FUNNEL_MAPPER/140_fmp_help.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/07_FUNNEL_MAPPER/140_fmp_help.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/07_FUNNEL_MAPPER/140_fmp_help.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
