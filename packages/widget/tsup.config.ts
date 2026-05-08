import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      react: "src/react.tsx",
      headless: "src/headless.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    platform: "browser",
    target: "es2020",
    external: ["react", "react-dom"],
  },
]);
