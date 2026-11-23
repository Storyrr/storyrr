import { defineConfig } from "vitest/config";

/**
 * Unit/integration tests. Separate from vite.config.ts so tests don't load the
 * Start, Nitro and Paraglide plugins. Runs on Node (better-sqlite3 is a native
 * addon): invoke with `bun run test`, never `bun test`.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
