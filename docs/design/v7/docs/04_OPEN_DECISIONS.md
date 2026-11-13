# 04 · Open decisions (the design uses the assumption shown; Claude Code must not decide these silently)

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
