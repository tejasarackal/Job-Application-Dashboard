import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-function unit tests for the workflow engine (filters, dedup keys,
// monotonic status, guardrails). Node env; resolves the `@/` path alias.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
