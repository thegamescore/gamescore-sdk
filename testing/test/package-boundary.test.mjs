import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// test/ -> testing/ -> repository
const repo = fileURLToPath(new URL("../../", import.meta.url));
test("published SDK excludes mocks, examples, tests, and planning files", () => {
  const [pack] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: repo,
      encoding: "utf8",
    }),
  );
  const files = pack.files.map((file) => file.path);
  assert.ok(files.includes("dist/index.js"));
  assert.ok(files.includes("dist/host.js"));
  assert.ok(files.includes("docs/events.md"));
  for (const path of files) {
    assert.match(
      path,
      /^(dist\/|README\.md$|package\.json$|docs\/(events|configuration|server)\.md$)/,
      path,
    );
    assert.doesNotMatch(path, /testing|examples|test\/|plan\.md/, path);
  }
  const manifest = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url)),
  );
  assert.deepEqual(Object.keys(manifest.exports), [".", "./host"]);
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
});
