import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@twin/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@twin/agent": path.resolve(__dirname, "../../packages/agent/src/index.ts"),
      "@twin/evaluation": path.resolve(__dirname, "../../packages/evaluation/src/index.ts"),
      "@twin/memory": path.resolve(__dirname, "../../packages/memory/src/index.ts"),
      "@twin/ui": path.resolve(__dirname, "../../packages/ui/src/index.tsx"),
    },
  },
});
