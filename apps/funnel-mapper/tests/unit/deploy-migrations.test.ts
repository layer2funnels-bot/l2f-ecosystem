import { describe, expect, it } from "vitest";
import { listMigrations, pendingMigrations } from "../../scripts/deploy/migrations.mjs";

type M = { version: string; name: string; file: string };
const repo: M[] = listMigrations(`${process.cwd()}/`);
const names = (ms: M[]) => ms.map((m) => m.name);

describe("deploy: which migrations to apply", () => {
  it("a fresh database gets every migration, in order", () => {
    expect(names(pendingMigrations(repo, []))).toEqual(names(repo));
  });
  it("versions recorded by the CLI / deploy script are skipped", () => {
    expect(pendingMigrations(repo, repo.map((m) => ({ version: m.version, name: m.name })))).toEqual([]);
  });
  it("databases migrated through the dashboard are matched by name, including chunked migrations", () => {
    // the production history at the time of writing: three migrations applied by hand, with dashboard timestamps
    const prod = [
      { version: "20261001203941", name: "init" },
      { version: "20261001204039", name: "builtin_templates" },
      { version: "20261001204229", name: "share_privacy" },
    ];
    const p = names(pendingMigrations(repo, prod));
    expect(p[0]).toBe("team_workspace");
    expect(p).not.toContain("init");
    const chunked = [...prod, { version: "1", name: "team_workspace" }, { version: "2", name: "access_hardening" }, { version: "3", name: "client_pricing" }, { version: "4", name: "canvas_elements_share" }, { version: "5", name: "workspaces_1_membership" }, { version: "6", name: "workspaces_5_storage" }, { version: "7", name: "signup_cleanup" }];
    expect(names(pendingMigrations(repo, chunked))[0]).toBe("workspace_members");
  });
  it("refuses a history with a gap (an older migration missing after newer ones) unless a baseline is given", () => {
    // the demo history: signup_cleanup was folded into the workspaces chunks, then workspace_members applied
    const demo = ["init", "builtin_templates", "share_privacy", "team_workspace", "access_hardening", "client_pricing", "canvas_elements_share", "workspaces_1_membership", "workspace_members_1_table"].map((name, i) => ({ version: `x${i}`, name }));
    expect(() => pendingMigrations(repo, demo)).toThrow(/signup_cleanup/);
    const wm = repo.find((m) => m.name === "workspace_members")!;
    expect(names(pendingMigrations(repo, demo, wm.version))).toEqual(names(repo.filter((m) => m.version > wm.version)));
  });
});
