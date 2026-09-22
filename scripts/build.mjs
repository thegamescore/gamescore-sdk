import { build } from "esbuild";
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/gamescore-sdk.js",
  bundle: true,
  format: "iife",
  globalName: "GameScoreSDK",
  target: "es2022",
  minify: true,
});
