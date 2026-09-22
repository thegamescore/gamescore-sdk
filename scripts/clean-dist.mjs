import { rm } from "node:fs/promises";
// Remove stale generated exports (including the former bundled testing entry).
await rm(new URL("../dist/", import.meta.url), {
  recursive: true,
  force: true,
});
