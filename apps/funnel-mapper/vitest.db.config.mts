import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  // suites share one database (and the roles suite changes roles), so files run one after another
  test: { include: ["tests/integration/**/*.test.ts"], fileParallelism: false, environment: "node", env: loadEnv(mode, process.cwd(), ""), testTimeout: 20000 },
}));
