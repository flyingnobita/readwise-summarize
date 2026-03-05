import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts", "src/*.test.ts"],
    exclude: ["src/integration.test.ts"],
  },
});
