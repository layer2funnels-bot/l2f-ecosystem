# V8 "Ledger" — design decisions and why they improve the product

## Diagnosis of v7 (owner feedback: "AI slop")
v7 read as AI-generated for nameable reasons: warm-cream SaaS palette with floating shadowed cards; a chunky display font on every title, number and card header; glossy extruded tiles inside work screens; tiny tracked uppercase labels; monospace numbers; gradient banners and washes; coloured pills for everything; right panels at 11.5–13.5 px (2,149 text nodes under 12 px).

## Decisions
| Area | v7 | V8 | Why it is better |
|---|---|---|---|
| Palette | Warm cream | Stone `#F3F4F1`, near-white `#FDFDFC`, ink `#141614` (Aurj warmer stone) | Neutral ground lets brand yellow, action blue and status colours be the only signals. |
| Type | Bricolage titles + Geist | Geist only (Bricolage only on the Launcher hero) | Calm and professional; titles stop competing with content. |
| Titles | 26–56 px display | 24 px pages, 30 px greetings | Content leads. |
| Containers | Floating cards, radius 12–18, shadows | Ruled panels: radius 8–10, 1 px line, header on its own hairline, no resting shadow | Structure from alignment, like a document. |
| KPIs | Separate boxes | One ruled band with dividers | Reads as one set of numbers. |
| Buttons | Extruded lip, radius 8–12 | Flat, radius 6, visible focus ring | A tool, not a toy; accessible. |
| Status | Coloured blobs | Word + dot on neutral | Meets "never colour-only"; scannable. |
| Section labels | 12 px tracked uppercase | 12.5–16 px sentence case | Readable; hierarchy by size/weight. |
| Numbers | Monospace | Geist tabular figures | Aligned columns without a "code" look. |
| App marks in work screens | Glossy plates | Flat colour marks (same icons/colours) | Launcher keeps the 3D plates; work screens stay quiet. |
| Right panels | 11.5–13.5 px | One size system (01 §5) | Comfortable to read without being oversized. |
| Text floor | 2,149 nodes < 12 px | 1,527, all initials/badges/thumbnails | Readability. |

## Per-app layout decisions
See `01_APPLICATIONS/<app>/APP_OVERVIEW.md` → "V8 look for this app" (Office My day row grid, Documents one-line cards, Team without gradients, Projects KPI band and real Workload heat map, Tasks without the wash, Clients connected stage stepper, Drive file-manager composition, Funnel Mapper scoped styles and client grid, Portal tabs).
