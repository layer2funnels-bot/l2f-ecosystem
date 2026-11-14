# Layer 2 Agents · responsive design

Global rules: `04_RESPONSIVE_DESIGN/DESKTOP_TABLET_MOBILE_RULES.md`. Navigation: `NAVIGATION_RESPONSIVE_BEHAVIOR.md`. This app's specifics: `APP_SPECIFIC_MOBILE_REQUIREMENTS.md`.

## Confirmed (shown by the V8 prototype at every width)

- Breakpoints: phone ≤760 px, tablet 761–1100 px, desktop >1100 px.
- Phone: rail and app sidebar hidden; bottom tab bar = the app's first 4 nav items + More; app bar shows the org mark that opens the apps-and-account sheet.
- Touch screens: every control ≥44 px (`@media (pointer:coarse)`).
- No horizontal page scroll at 390 px on any page of this app (automated check).

## Page-by-page screenshots

| Page | Desktop 1440 | Tablet 834 | Phone 390 |
|---|---|---|---|
| Agents (`#/agents/home`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/120_agents_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/120_agents_home.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/120_agents_home.jpg) |
| Meeting Intelligence (`#/agents/meeting/new`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/121_agents_meeting_new.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/121_agents_meeting_new.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/121_agents_meeting_new.jpg) |
| Ask (`#/agents/ask`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/122_agents_ask.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/122_agents_ask.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/122_agents_ask.jpg) |
| Meeting Intelligence (`#/agents/meetings`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/174_agents_meetings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/174_agents_meetings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/174_agents_meetings.jpg) |
| Access & settings (`#/agents/settings`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/175_agents_settings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/175_agents_settings.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/175_agents_settings.jpg) |
| Weekly team call (`#/agents/meeting/m1`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/176_agents_meeting_m1.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/176_agents_meeting_m1.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/176_agents_meeting_m1.jpg) |
| Weekly team call (`#/agents/meeting/m1/notes`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/177_agents_meeting_m1_notes.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/177_agents_meeting_m1_notes.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/177_agents_meeting_m1_notes.jpg) |
| Weekly team call (`#/agents/meeting/m1/transcript`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/178_agents_meeting_m1_transcript.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/178_agents_meeting_m1_transcript.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/178_agents_meeting_m1_transcript.jpg) |
| Weekly team call (`#/agents/meeting/m1/actions`) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/desktop-1440/13_LAYER_2_AGENTS/179_agents_meeting_m1_actions.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/tablet-834/13_LAYER_2_AGENTS/179_agents_meeting_m1_actions.jpg) | [view](../../06_SCREENSHOTS_AND_REFERENCES/v8/phone-390/13_LAYER_2_AGENTS/179_agents_meeting_m1_actions.jpg) |

## Proposed (not separately approved by the owner — see D14/D15)

- Tables become stacked rows on phone (label: value) when they have more than 3 columns; first column stays the row title.
- Right-side panels/drawers open full screen on phone with a sticky header (Close, title) and pinned footer actions.
- Dialogs become bottom sheets on phone (max height 90 vh, drag handle, sticky actions).
- Multi-column dashboards collapse to one column in reading order: primary list first, side summaries after.
