import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    widget: "src/legacy-global.ts",
  },
  format: ["iife"],
  globalName: "SupoWidget",
  minify: true,
  dts: false,
  sourcemap: false,
  clean: false,
  outDir: "../../public",
  platform: "browser",
  target: "es2020",
  outExtension() {
    return { js: ".js" };
  },
});
