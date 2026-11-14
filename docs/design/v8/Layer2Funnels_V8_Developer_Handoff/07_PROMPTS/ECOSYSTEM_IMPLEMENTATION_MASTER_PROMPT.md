# Ecosystem implementation master prompt · paste into Claude Code at the start of the project

You are Claude Code. You will implement the Layer2Funnels + Aurj ecosystem designed in **V8 "Ledger"** in the repository `layer2funnels-bot/l2f-ecosystem` (Funnel Mapper lives in its own repo `Funnel-Mapper`).

1. Put this package at `docs/design/v8/`. Read `CLAUDE_CODE_START_HERE.md`, then all of `00_MASTER_DOCUMENTATION/`, then `09_FINAL_HANDOFF/IMPLEMENTATION_SEQUENCE.md` and the manager's process document in `09_FINAL_HANDOFF/`.
2. Write `docs/implementation/ECOSYSTEM_PLAN.md`: inventory of the repo vs the V8 page inventory (`05_STRATEGY_AND_ARCHITECTURE/PAGE_HIERARCHY.md`), shared foundation to build, order P00 → P14, risks, open decisions you need answered. Stop and wait for "go".
3. Then run the per-app prompts in `07_PROMPTS/` in order, one app at a time. Each app: plan → my approval → build → tests → report. Do not start the next app before I approve the report.
4. Never remove, merge, rename or simplify anything that exists in V8. Never invent features. Ask when the docs are silent and there is no documented assumption.
5. After every app run `DESIGN_QUALITY_ASSURANCE_PROMPT.md`, `ACCESSIBILITY_AND_USABILITY_REVIEW_PROMPT.md` and the app part of `MOBILE_RESPONSIVENESS_MASTER_PROMPT.md`; finish the project with `P14_FULL_REGRESSION_CHECK.md` and `FUNCTIONAL_TESTING_MASTER_PROMPT.md`.
