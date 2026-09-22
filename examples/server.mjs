import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createMockBackend } from "../testing/dist/index.js";
import { campaigns } from "./campaigns.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4210);
const gamePort = Number(process.env.GAME_PORT || 4211);
const hostOrigin = `http://localhost:${port}`;
const gameOrigin = `http://localhost:${gamePort}`;
const configs = campaigns(hostOrigin, gameOrigin);
const players = new Map();
const matches = new Map();
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
};
async function staticFile(res, base, pathname) {
  let path = resolve(base, "." + decodeURIComponent(pathname));
  if (path !== base && !path.startsWith(base + sep))
    throw new Error("Invalid path");
  if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
  const data = await readFile(path);
  res.writeHead(200, {
    "Content-Type": mime[extname(path)] || "application/octet-stream",
  });
  res.end(data);
}
const json = (res, data, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 40000) throw new Error("Body too large");
  }
  return text ? JSON.parse(text) : {};
}
const host = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, hostOrigin);
    const parts = url.pathname.split("/").filter(Boolean);
    const data = req.method === "POST" ? await body(req) : {};
    if (parts[0] === "games" && parts[2] === "config") {
      if (!configs[parts[1]])
        return json(res, { message: "Unknown demo campaign" }, 404);
      return json(res, configs[parts[1]]);
    }
    if (parts[0] === "player") {
      if (parts[1] === "update") {
        Object.assign(players.get(data.uuid) ?? {}, data);
        return json(res, {});
      }
      const player = players.get(parts[2]) ?? {
        uuid: randomUUID(),
        name: "Demo Player",
      };
      players.set(player.uuid, player);
      return json(res, player);
    }
    if (parts[0] === "matches" && parts[1] === "cooldown")
      return json(res, {
        onCooldown: false,
        matchesPerPlayer: null,
        matchesUsed: 0,
        cooldownSeconds: 0,
        availableAt: null,
      });
    if (parts[0] === "matches" && parts[1] === "start") {
      if (!configs[parts[2]]) throw new Error("Unknown campaign");
      const backend = createMockBackend();
      const started = await backend.start();
      matches.set(started.matchId, { backend, gameId: parts[2] });
      return json(res, {
        ...started,
        gameData: configs[parts[2]].sdk.publicSettings,
      });
    }
    if (parts[0] === "matches") {
      const match = matches.get(parts[1]);
      if (!match) throw new Error("Unknown match");
      if (parts[2] === "progress") {
        await match.backend.progress(parts[1], data.sequence, data.progress);
        return json(res, data.progress);
      }
      if (parts[2] === "complete") {
        await match.backend.complete(parts[1]);
        res.writeHead(204);
        return res.end();
      }
      if (parts[2] === "result") {
        const result = await match.backend.result(parts[1]);
        return json(res, {
          ...result,
          immediateRewards:
            result.score >= 50
              ? [
                  {
                    title: "Demo reward",
                    text: "Simulated reward — no monetary value.",
                    icon: "★",
                  },
                ]
              : [],
        });
      }
    }
    if (parts[0] === "analytics") return json(res, []);
    if (url.pathname === "/runtime.json")
      return json(res, { hostOrigin, gameOrigin });
    if (url.pathname.startsWith("/testing/"))
      return await staticFile(
        res,
        resolve(root, "testing/dist"),
        url.pathname.slice("/testing".length),
      );
    await staticFile(
      res,
      root,
      url.pathname === "/" ? "/examples/index.html" : url.pathname,
    );
  } catch (error) {
    json(res, { message: error.message }, error.code === "ENOENT" ? 404 : 400);
  }
});
const games = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, gameOrigin).pathname;
    if (path.startsWith("/dist/")) return await staticFile(res, root, path);
    const match = path.match(/^\/(glow|sprint|sample)(\/.*)?$/);
    if (!match) throw new Error("Unknown game");
    const base = resolve(
      root,
      match[1] === "sample" ? "examples/sample" : `examples/vendor/${match[1]}`,
    );
    await staticFile(res, base, match[2] || "/");
  } catch (error) {
    json(res, { message: error.message }, 404);
  }
});
host.listen(port, () =>
  console.log(`SDK demo gallery: ${hostOrigin} (mock backend)`),
);
games.listen(gamePort, () => console.log(`Cross-origin games: ${gameOrigin}`));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    host.close();
    games.close();
  });
