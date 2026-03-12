import { defineConfig } from "vitest/config";
import path from "path";

const packagesRoot = path.resolve(__dirname, "../../packages");

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@twin/agent": path.resolve(packagesRoot, "agent/src/index.ts"),
      "@twin/core": path.resolve(packagesRoot, "core/src/index.ts"),
      "@twin/evaluation": path.resolve(packagesRoot, "evaluation/src/index.ts"),
      "@twin/mediums": path.resolve(packagesRoot, "mediums/src/index.ts"),
      "@twin/memory": path.resolve(packagesRoot, "memory/src/index.ts"),
      "@twin/ui": path.resolve(packagesRoot, "ui/src/index.tsx"),
    },
  },
});
