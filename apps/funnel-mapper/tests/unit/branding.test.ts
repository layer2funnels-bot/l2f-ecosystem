import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// V7: the product is "Funnel Mapper" in every user-facing place. Internal ids (package name, export format "funnel-mapper-pro",
// database names) stay, so files exported earlier still import. This guards the UI, metadata and e-mail templates.
const ROOTS = ["app", "components", "supabase/templates"];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : /\.(tsx?|html|css)$/.test(n) ? [p] : []; });

describe("branding", () => {
  it('no user-facing "Funnel Mapper Pro"', () => {
    const hits = ROOTS.flatMap(files).filter((f) => /Funnel Mapper Pro|Mapper Pro V2/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
