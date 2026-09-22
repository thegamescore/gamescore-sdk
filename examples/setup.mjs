import { spawnSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (flag, fallback) =>
  args.includes(flag)
    ? resolve(args[args.indexOf(flag) + 1])
    : resolve(root, fallback);
function run(cwd, command, argv) {
  const result = spawnSync(command, argv, { cwd, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`${command} ${argv.join(" ")} failed in ${cwd}`);
}
run(root, "npm", ["run", "build:all"]);
const sources = [
  ["launcher", option("--launcher-path", "../game-launcher"), "dist"],
  ["glow", option("--glow-path", "../catch-your-glow"), "build"],
  ["sprint", option("--sprint-path", "../sprint-challenge"), "dist"],
];
await mkdir(resolve(root, "examples/vendor"), { recursive: true });
const provenance = {};
for (const [name, cwd, output] of sources) {
  if (!args.includes("--skip-install"))
    run(cwd, "npm", ["install", "--install-links=false"]);
  run(cwd, "npm", ["run", "build"]);
  await cp(resolve(cwd, output), resolve(root, "examples/vendor", name), {
    recursive: true,
    force: true,
  });
  const rev = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  provenance[name] = {
    source: cwd,
    commit: rev.stdout.trim(),
    builtAt: new Date().toISOString(),
    note: "Includes current working tree changes",
  };
}
await writeFile(
  resolve(root, "examples/vendor/provenance.json"),
  JSON.stringify(provenance, null, 2),
);
console.log("Examples ready. Run npm run dev.");
