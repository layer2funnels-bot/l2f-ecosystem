# Retired test suites

These suites tested the old Projects app (migrations 0013 and 0034–0038, `packages/core/project-operations.mjs`,
`apps/web/js/modules/projects.js`). The old app was replaced by Projects V2 at the cutover (migration 0051): its tables are
kept untouched as a backup and its operations are no longer served, so these suites no longer run (`test/run.mjs`).

Projects V2 is covered by `test/projects-v2-db.test.mjs`, `test/projects-v2-api.test.mjs` and `test/projects-cutover.test.mjs`.
They are kept here, unchanged, as the record of what the old app guaranteed.
