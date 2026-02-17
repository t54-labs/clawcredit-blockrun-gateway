import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  sourcemap: true,
  clean: true,
  dts: true,
  target: "node20",
});
