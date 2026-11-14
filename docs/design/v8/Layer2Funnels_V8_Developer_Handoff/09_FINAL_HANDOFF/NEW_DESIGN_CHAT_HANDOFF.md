# Handoff for the next design chat (V8 "Ledger" is final)

Attach `Layer2Funnels_V8_Developer_Handoff.zip`. Continue from V8; don't restart.

- **Owner:** Tabish Riaz (Layer2Funnels LLC + Aurj). Wants research before design, professional non-generic look, short replies, complete work, $0 extra monthly cost. Never redesign Planner, Projects or Funnel Mapper functions from assumptions.
- **History:** v3 Signal → v4 → v5 rail shell → v6 rebuilt from real apps → v7 sizing → **V8 "Ledger"** (visual/UX redesign only; nothing added or removed — proven in `V8_COMPLETENESS_AUDIT.md`). A later "Canvas" (v9) direction and a "Job docket" direction were rejected by the owner; V8 was chosen.
- **Prototype source:** `08_PROTOTYPE_AND_SOURCE/prototype-source/` → `python3 build8.py`. Change visuals in `v8.css` (last layer) and data fixes in `v8.js`.
- **Locked decisions:** see `00_MASTER_DOCUMENTATION/03_PERMISSIONS_DATA_INTEGRATIONS.md` table + `04_OPEN_DECISIONS.md`.
- **Open work:** D1–D18; recommendations R1–R7; Layer 2 Agents real design when a provider is chosen; owner review of tablet/phone (D14/D15).
- **How to verify a change:** crawl every route at 1440/1366/834/390 (Playwright), compare controls/headings against the previous version, check JS errors, horizontal overflow, "undefined", text <12 px; regenerate screenshots with the self-hosted fonts.
