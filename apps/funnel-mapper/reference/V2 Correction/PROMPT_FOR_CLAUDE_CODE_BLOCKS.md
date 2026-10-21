# Prompt for Claude Code: block redesign (paste this)

Implement the picture-first block redesign. Read `BLOCK_REDESIGN_SPEC.md` first and build to the artboard **`V4-block-design`** in the package (`project/V4-block-design.dc.html`). Do this as its own change, separate from the other editor work.

Rules: do not change the maths engine, database architecture, RLS, roles or workspace isolation. Keep the existing left sidebar and the settings box design. Dark is the default theme and Light is an addition. Every stored image is under 100 KB.

Do, in order:
1. Replace the box block with the picture-first block for pages and offers, and the shape blocks for sources, conditions, messages, events and goals. One number chip per block, chosen by the view (Clean / People / Money) and mode (Plan / Actual).
2. Add the Actual-mode chip: a dashed "—" when empty; clicking it opens a one-field popup to type the number (Enter saves, Esc cancels, "Open settings ›").
3. **Remove every style setting that only styles the box** (border, radius, fill, font weight/size/alignment, compact/expanded, caption bar, status dot, in/out text line, per-block status). Keep accent colour, icon, show/hide number chip, name and lock. Do not run a destructive migration; ignore old stored keys and tell me what you would clean up.
4. Update everything that draws a block: canvas, live funnel preview renderer, thumbnails, Present, Shared view, exports (PNG/SVG/PDF), the 13 templates (re-space to 240 × 200), Tidy up, snap, minimap.
5. Add the 208 × 256 page-image derivative (under 100 KB).

Then open the app in a browser with a funnel of 15 or more blocks and check: Clean has no numbers; People and Money show one chip per block; no names or labels overlap; the page preview opens only from the picture. Run the existing tests and add Playwright checks for those points. Send screenshots (Dark and Light) and list anything you could not build or had to change, and why.
