# Design quality assurance prompt · paste into Claude Code after building an app

Compare the built app with V8, page by page.

1. For every page in `01_APPLICATIONS/<app>/PAGES_AND_NAVIGATION.md`, take screenshots at 1440, 834 and 390 px (light; then dark) and place them next to the V8 screenshots in `06_SCREENSHOTS_AND_REFERENCES/v8/`.
2. Check and record per page (pass/fail + fix):
   - Type: Geist only (Bricolage only on the Launcher hero); sizes per `01_DESIGN_SYSTEM.md` §3; nothing under 12 px except initials and file badges.
   - Right panels per §5 (labels 13.5–14, values 15, rows 44, sections 16).
   - Containers: ruled panels, radius 8–10, no resting shadows, header on its own hairline.
   - Buttons flat radius 6; status = word + dot; KPI = one ruled band; section labels sentence case; numbers tabular Geist (not monospace).
   - Alignment: columns line up across rows (name, people, date, status); sidebars never scroll horizontally; no text wraps into 3 lines inside cards.
   - Anti-patterns in §9 absent (gradients, glossy tiles in work screens, tracked uppercase labels, pill blobs).
   - No class leaks: inspect that this app's components do not change other apps (open two other apps and compare with their screenshots).
3. Fix every fail, then re-shoot. Output `docs/implementation/<APP>_DESIGN_QA.md`.
