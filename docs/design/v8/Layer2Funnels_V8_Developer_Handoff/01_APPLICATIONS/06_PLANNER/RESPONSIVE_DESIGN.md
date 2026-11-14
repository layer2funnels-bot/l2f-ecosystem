# Planner · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Home (`#/planner/home`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/054_planner_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/054_planner_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/054_planner_home.jpg) |
| My work (`#/planner/mywork`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/055_planner_mywork.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/055_planner_mywork.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/055_planner_mywork.jpg) |
| Plans (`#/planner/plans`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/056_planner_plans.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/056_planner_plans.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/056_planner_plans.jpg) |
| Plan: Planner view (`#/planner/plan/map`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/057_planner_plan_map.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/057_planner_plan_map.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/057_planner_plan_map.jpg) |
| Plan: Timeline (`#/planner/plan/timeline`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/058_planner_plan_timeline.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/058_planner_plan_timeline.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/058_planner_plan_timeline.jpg) |
| Plan: Reviews (`#/planner/plan/reviews`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/059_planner_plan_reviews.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/059_planner_plan_reviews.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/059_planner_plan_reviews.jpg) |
| Plan: Settings (`#/planner/plan/settings`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/060_planner_plan_settings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/060_planner_plan_settings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/060_planner_plan_settings.jpg) |
| Alignment (`#/planner/alignment`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/061_planner_alignment.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/061_planner_alignment.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/061_planner_alignment.jpg) |
| Reports (`#/planner/reports`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/062_planner_reports.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/062_planner_reports.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/062_planner_reports.jpg) |
| Strategy map (redesigned) (`#/planner/model/map`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/063_planner_model_map.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/063_planner_model_map.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/063_planner_model_map.jpg) |
| Objective kinds (`#/planner/model/kinds`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/064_planner_model_kinds.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/064_planner_model_kinds.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/064_planner_model_kinds.jpg) |
| KPI types (`#/planner/model/kpi`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/065_planner_model_kpi.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/065_planner_model_kpi.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/065_planner_model_kpi.jpg) |
| Focus areas (`#/planner/model/fa`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/066_planner_model_fa.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/066_planner_model_fa.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/066_planner_model_fa.jpg) |
| Time horizons (`#/planner/model/horizons`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/067_planner_model_horizons.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/067_planner_model_horizons.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/067_planner_model_horizons.jpg) |
| Templates (`#/planner/model/tpl`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/068_planner_model_tpl.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/068_planner_model_tpl.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/068_planner_model_tpl.jpg) |
| First 1000 Followers on Facebook (`#/planner/plan/p1/builder`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/123_planner_plan_p1_builder.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/123_planner_plan_p1_builder.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/123_planner_plan_p1_builder.jpg) |
| Strategy model (`#/planner/model`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/06_PLANNER/139_planner_model.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/06_PLANNER/139_planner_model.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/06_PLANNER/139_planner_model.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
