# Block redesign: picture-first blocks (spec for Claude Code)

Design reference: artboard **`V4-block-design`**. This replaces the "box" block everywhere in the app. Do the work as one self-contained change; do not mix it with other editor work.

## What changes, in one sentence
A block stops being a box (name, numbers, caption bar, small image) and becomes **a picture with the name underneath and one number chip**.

## 1. Anatomy (page and offer blocks)
| Part | Spec |
|---|---|
| Picture | **104 × 128**, radius 12, 1px border `#2A3648` (Light: `#D3DBE6`), soft shadow. The page capture, top-anchored, or the page-type wireframe if none. Family-colour bar, 4px, along the bottom edge. |
| Type glyph | 20px rounded square, top-left, family colour, white glyph. |
| Number chip | **One per block**, top-right, offset −12px / −10px, pill, 11.5px bold. Content depends on the view (section 3). |
| Price ribbon | Offers only: bottom-left of the picture, `AED 37`, `AED 110/mo` (nowrap). |
| Name | Under the picture, 13px/600, centred, **two lines at most then ellipsis**, full name in the tooltip. |
| Subtype | 11px muted under the name ("Quiz page", "Checkout · one-time"). Shown at Mid and Near zoom only. |
| Ports | Four (top, right, bottom, left), 11px circles. **Hidden at rest**; shown on hover, selection, or while connecting. |
Other families keep the same rules (name under, one chip, glyph or shape carries the type): **source** 64px disc; **condition** 50px rounded square rotated 45°; **message** 62×56 bubble; **event** (Form Completed, Add to Cart…) 44px rotated square; **goal** lime disc with a flag. Lines attach to the **picture or shape edge**, never to the label.

## 2. States (draw exactly one extra thing per state)
Default; **Hover**: dashed emerald outline around the picture and ports (the page-preview popup still opens only from the picture); **Selected**: 2px emerald ring plus 6px glow; **Needs a fix**: 1.5px amber ring and an amber "!" chip replaces the number chip; **Biggest leak**: dashed orange ring plus a "Biggest leak" chip above-left (no number); **Locked**: small lock at bottom-right of the picture.

## 3. The number chip, by view and mode
| View / mode | Chip shows |
|---|---|
| Clean | nothing |
| People (default), Plan | people in (read-only) |
| Money, Plan | revenue per month on offers, spend per month on sources; none elsewhere |
| Actual, number entered | the actual number |
| Actual, nothing entered | dashed chip "—" |
Whole people only; `<1` for tiny values. A block never shows more than this one number.

## 4. Where the user puts data (keep the editor calm)
1. **Settings box** (double-click or Enter): the inputs (rates, price, visits, page, notes). Already specified in `V3-settings-box`.
2. **Click the number chip in Actual mode**: a small popup under the chip with one field ("People in · 1 – 31 Oct"). Enter saves, Esc cancels, "Open settings ›" opens the box. No panel opens.
3. Plan numbers are results, so the chip is **not editable in Plan**.
Nothing else is added to the block: no inline fields, no extra buttons, no always-visible controls.

## 5. Style settings: remove the box styling
The old Style tab let people change the box. **Audit the Style tab, the block data model and every renderer, and remove every setting that only exists to style the box**: box border (colour, width, style), corner radius, box fill or background, font weight, font size, text alignment, "compact / expanded" card, caption bar, status dot, and the in/out text line. **Keep:** accent colour (optional override of the family colour: glyph, bottom bar, disc), icon (sources, events, custom blocks), show or hide the number chip (per block), name, lock.
- Remove the controls and every code path that reads them.
- **Do not run a destructive migration.** Leave old keys in stored JSON untouched and ignore them. Propose a clean-up migration to the owner separately.
- Remove "Status" per block if it still exists (a funnel has a status, blocks do not).

## 6. Everything that draws a block must change
The editor canvas; the **live funnel preview renderer** (cards, tables, Home); page thumbnails; Present and Shared view; PNG/SVG/PDF exports; templates preview and the 13 templates; the Blocks library tiles keep their own look but the placed block uses this design. Page images: add a 208 × 256 top-anchored derivative (still under 100 KB, 2× the picture), keep the 132 × 130 derivative for tiny previews.

## 7. Layout
Block pitch **240px across, 200px down** (names need room). Update Tidy up, frame padding, snap, minimap and the template coordinates (templates were built on 250 × 150: re-space them on load). Labels must never overlap a neighbouring block or a line label; if two would collide, the line label is hidden first.

## 8. Zoom
Far: shapes and lines only. Mid: names. Near: number chips and subtype.

## 9. Accessibility
Name is the accessible name; chip has a text alternative ("2,300 people in"); focus ring on the picture; contrast checked in Dark and Light; meaning is never colour alone (glyph, shape and text carry it).

## 10. Acceptance
- Clean shows names and lines only. People/Money show exactly one chip per block.
- No box styling control remains in the Style tab or in code.
- Hovering the title or the chip never opens the page preview; hovering the picture does.
- A 20-block funnel has no overlapping names or labels.
- All existing maths, reports, scenarios, forecast, goals, sharing, export and template tests pass; no calculated number changes.
- Screenshots in Dark and Light of: a 15+ block funnel, each state, the Actual chip popup, a PNG export, and the Funnels list previews.
