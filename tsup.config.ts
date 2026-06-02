import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  minify: true,
  outDir: "dist/bundle",
  sourcemap: true,
  splitting: false,
  target: "es2020",
});
