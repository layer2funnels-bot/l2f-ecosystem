# 04 · Open decisions (V8) (the design uses the assumption shown; Claude Code must not decide these silently)

| # | Decision | Design assumption | Who |
|---|---|---|---|
| D1 | Funnel Mapper client migration timing and matching rules | Read-only first, matching report, then write-through (16_FUNNEL_MAPPER) | Tabish |
| D2 | When FM's team/workspace settings move to Office › Admin | After client migration; FM pages show a notice meanwhile | Tabish |
| D3 | Email provider for notification digests and invitations | In-app only now; email shows "Later" | Tabish |
| D4 | Document import parsing for avatars (DOCX/PDF) — run locally in the app server or an approved service | Local parsing (mammoth/docx-io + pdf text) on the server; no external AI | Tabish |
| D5 | Realtime presence ("Ahmad is viewing") in editors | Show "Last edited by" until a realtime channel exists | Claude Code proposes |
| D6 | Client edition of Office: exact home content for client contacts | Home (their requests/approvals, next steps, shared files), their notes; their allowed apps | Tabish |
| D7 | AI provider, cost cap, retention for Layer 2 Agents | Not built; preview pages only | Tabish |
| D8 | Whether a Form submission can create a client or a task automatically | "Automations: Later" | Tabish |
| D9 | Version thinning schedule (30/90 days) defaults | As in Admin › Storage | Tabish |
| D10 | Client Portal go-live (security gate G2) | Locked; everything "prepared" | Tabish |
| D11 | Newsreader serif (v7 quotes/avatar beliefs) is not self-hosted in the repo and V8 does not use it | Geist only; quotes in Geist italic | Tabish (confirm) |
| D12 | Dark-mode shadows: the V8 prototype applies the light shadow values in dark mode too | Ship v7 dark shadow values (`02_DESIGN_SYSTEM/tokens.json`) | Claude Code proposes, Tabish approves |
| D13 | Page-specific empty / loading / error copy is designed only where noted in `PAGES_AND_NAVIGATION.md`; most pages rely on the shared states | Use 02 §9 shared states with plain-words copy; list the copy written in each app report | Tabish reviews copy |
| D14 | Tablet (761–1100 px) layouts come from the prototype's responsive CSS; the owner has not reviewed tablet screenshots separately | Treat prototype behaviour as the target; owner reviews in each app report | Tabish |
| D15 | Phone layouts exist for every page in the prototype (390 px screenshots) but were not separately approved; items marked "Proposed" in `04_RESPONSIVE_DESIGN/` are suggestions | Build confirmed behaviour; build proposed behaviour only after approval | Tabish |
| D16 | Recommendations R1–R7 (`V8_RECOMMENDATIONS.md`) | Not built | Tabish |
| D17 | Two original strategy-map canvases ("Layer2Funnels Ecosystem · How It Works", "Layer2funnels Ecosystem Architecture") live as claude.ai design canvases and are linked, not exported, in this package | Diagrams in `05_STRATEGY_AND_ARCHITECTURE/` are derived from the briefs; the canvases win if they disagree | Tabish (export if needed) |
| D18 | The 2026-10-19 Blueprint Visuals (included as original) predate later decisions: it shows "Funnel Mapper Pro" as a separate tool with no link and an 8-app baseline; v7/V8 decided shared clients with Funnel Mapper and 13 apps | V8 decisions win (blueprint is historical) | — (recorded for clarity) |
