import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/contracts/*.integration.ts"],
    environment: "node",
    testTimeout: 30000,
    fileParallelism: false,
  },
});
