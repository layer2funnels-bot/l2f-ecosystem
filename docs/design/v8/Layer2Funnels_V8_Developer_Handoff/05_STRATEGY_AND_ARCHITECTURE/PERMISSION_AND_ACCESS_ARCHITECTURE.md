# Permission and access architecture

```mermaid
flowchart TB
  person["Person (one sign-in)"] --> mem["Membership per organization (L2F, Aurj) — strict isolation"]
  mem --> rel["Relationships: Teammate · Client contact · both"]
  rel --> role["Role: Owner · Admin · Editor · Viewer · Freelancer"]
  role --> appacc["App access: on/off + level per app"]
  appacc --> feat["Feature switches (e.g. Create personal projects, See teammates' tasks)"]
  rel --> clientacc["Client access: which client apps a client contact can open (owner only)"]
  feat --> rls["Enforced in DB/API: RLS + checks, default deny; audit log"]
  clientacc --> rls
```

- Owner manages teammates **and** client access; Admin manages teammates only (sees client access read-only).
- Personal spaces (personal projects, personal task lists, private tasks) are visible to their owner only — even admins cannot see them (private tasks appear as a count).
- Check access (person page) and Access review (with last_used_at) explain effective access.
- Full rules: `00_MASTER_DOCUMENTATION/03_PERMISSIONS_DATA_INTEGRATIONS.md` §1–2. Test matrix: `07_PROMPTS/FUNCTIONAL_TESTING_MASTER_PROMPT.md`.
