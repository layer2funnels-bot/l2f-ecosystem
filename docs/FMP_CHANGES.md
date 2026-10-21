# Funnel Mapper Pro copy: change ledger

The pristine copy is the git tag **`fmp-copy-pristine`** (commit `ca5f42a`, source `Funnel-Mapper@13a1e86`, 654 files; hashes in `docs/fmp-copy-manifest.json`). Reshaping is approved (owner, 21 Oct 2026), so `apps/funnel-mapper/` may now differ from the tag. `npm run check:fmp-copy` enforces two things: the tag never moves, and **every file that differs from the tag has a row here** (path in backticks in the first column) with the reason. A row for a file that did not change fails the check.

Rules that still apply: code only; no real data; no connection to any live project; no deploy; the original repository is never touched.

| File | Change | Reason |
|---|---|---|
| `.env.example` | Added `ECOSYSTEM_LAUNCHER_URL` (empty). | The Launcher button in the new header opens the ecosystem Launcher once an address is set; no value is committed. |
| `app/layout.tsx` | Always light (`data-theme="light"`); no saved theme read; the theme script and cookie removed. Fonts now self-hosted (`next/font/local`, the same three families and weights) instead of `next/font/google`. | Design 08: light by default, dark later; nothing may flip the copy back to dark. |
| `app/globals.css` | Colour tokens replaced by the ecosystem tokens (light default, dark kept for later); `--color-edge` added; editor height rule for the compact header. | Design 08 colour mapping: Emerald retired, blue primary, success blue, leak and warning amber-brown, no green on nodes. |
| `app/(app)/layout.tsx` | Sidebar, old top strip and theme sync replaced by the ecosystem header; unused sidebar queries (pinned clients, counts) dropped. | Design 08: REPLACE top bar, logo, user menu. Data shown is the same. |
| `app/(app)/page.tsx` | Status dot colour for active funnels: green to the success blue. | Design 08 colour mapping (success). |
| `app/(app)/settings/page.tsx` | Appearance section and its menu entry removed. | Light only; the theme choice is retired. Profile, team and workspace settings stay until the app moves onto the ecosystem sign-in. |
| `app/funnels/[id]/page.tsx` | Compact ecosystem header above the editor. | Design 08: the header is compact in the editor to protect canvas height. |
| `components/app-nav.tsx` | Deleted (sidebar). | Replaced by `components/eco-header.tsx`. |
| `components/top-strip.tsx` | Deleted (search and create strip). | Its search and create actions moved into the ecosystem header. |
| `components/theme-toggle.tsx` | Deleted (light/dark toggle, theme sync, appearance picker). | Light only in this copy. |
| `components/workspace-switcher.tsx` | Restyled as the organization control in the header (bordered chip, light popover). Same actions and test ids. | Design 08 look; Funnel Mapper Pro keeps its own workspaces in step 1. |
| `components/editor/editor.tsx` | The "Switch light / dark" item removed from the File menu. | Light only. |
| `components/editor/editor.css` | Emerald tints, rings, handle dots and text colours mapped to the ecosystem blue; simulation "up" colours to the success blue. | Design 08 colour mapping. No layout or behaviour change. |
| `components/editor/canvas.tsx` | Default colour of a frame without one: Emerald to the primary blue; comment updated. | Design 08 colour mapping. |
| `components/editor/nodes.tsx` | Default frame colour: Emerald to the primary blue. | Same. |
| `components/editor/settings-box.tsx` | First swatch: Emerald to the primary blue. | Same. |
| `components/editor/style-panel.tsx` | Colour field fallback and first accent: Emerald to the primary blue. | Same. |
| `components/status-pill.tsx` | Dot colours for live/active: green to the success blue. | Design 08 colour mapping (success). |
| `lib/catalog.ts` | Stage frame default colour and the first frame colour swatch: Emerald to the primary blue ("Primary blue"). | Same. |
| `lib/design-tiles.ts` | Template thumbnail strokes and fills: Emerald to the ecosystem blues. | Same. |
| `lib/export.ts` | Default frame colour in exports: Emerald to the primary blue, to match the canvas. | Keeps an exported frame the same colour as on screen. The export palettes and chart colours are unchanged in step 1. |
| `lib/funnel-preview.ts` | Default frame colour in previews: Emerald to the primary blue. | Same. |
| `lib/style.ts` | Connection presets Yes and Purchase: green to the success blue; Emphasis and Ghost borders: Emerald to the primary blue. | Design 08 colour mapping (success, brand). |
| `components/eco-header.tsx` | New: the ecosystem header (colour bar, Launcher button, organization control, search, create actions, profile menu, Funnel Mapper Pro menu, phone bottom bar, compact editor variant). | Design 08: REPLACE the top bar, logo and user menu; ecosystem look and navigation. |
| `app/fonts/bricolage-grotesque-latin-500-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/bricolage-grotesque-latin-700-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/bricolage-grotesque-latin-800-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/dm-sans-latin-400-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/dm-sans-latin-500-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/dm-sans-latin-700-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/jetbrains-mono-latin-400-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/jetbrains-mono-latin-500-normal.woff2` | Added (latin subset, unmodified from the `@fontsource` npm package). | Self-hosted font: the build must never fetch Google Fonts (a fetch failure broke a CI build). SIL OFL 1.1. |
| `app/fonts/LICENSES.txt` | Added: the three OFL licence texts. | Licence obligation for the bundled fonts. |
