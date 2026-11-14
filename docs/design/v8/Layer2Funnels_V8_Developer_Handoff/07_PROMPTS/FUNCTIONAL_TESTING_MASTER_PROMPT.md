# Functional testing master prompt · paste into Claude Code

Write and run automated tests that prove nothing from V8 is missing and every function works.

1. **Inventory test:** for each page in every `PAGES_AND_NAVIGATION.md`, open the route as a permitted user and assert every listed control (by label/accessible name) exists. Failures = missing features.
2. **Flow tests:** every flow in each app's `USER_FLOWS_AND_WORKFLOWS.md` and every cross-app flow in `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`, end to end, with real data.
3. **Permission matrix:** roles owner, admin, editor, viewer, freelancer, client contact, teammate+client × both organizations × every app: allowed actions succeed; forbidden actions fail at the API (direct calls), not only in the UI. Personal projects/lists and private tasks invisible to others (incl. admins). Search and notifications never leak.
4. **States:** force loading, empty, error (and 10 s timeout), permission denied, read-only, archived, offline, conflict on each page type.
5. **Golden tests kept:** Projects e2e suite, Planner suites (277 DB checks), Funnel Mapper golden funnel numbers (89.1 / 6,032.11 / 5,582.11 / 13.40x).
6. **Grep tests:** no "Funnel Mapper Pro" in UI strings; no hex colours in component CSS (DV20).
Output `docs/implementation/FUNCTIONAL_TEST_REPORT.md` with counts and failures.
