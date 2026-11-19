import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    environmentOptions: {
      // Never load the /embed page or other URLs during tests.
      happyDOM: { settings: { disableIframePageLoading: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } },
    },
    include: ["src/**/*.test.ts"],
  },
});
