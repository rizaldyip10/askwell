import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Booting PGlite (WASM) and applying migrations takes a few seconds.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
