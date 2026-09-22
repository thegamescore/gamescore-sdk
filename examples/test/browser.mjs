import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.env.TEST_PORT || 4220);
const gamePort = Number(process.env.TEST_GAME_PORT || 4221);
const hostOrigin = `http://localhost:${port}`;
const gameOrigin = `http://localhost:${gamePort}`;

const server = spawn(process.execPath, ["examples/server.mjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), GAME_PORT: String(gamePort) },
});
let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk;
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk;
});
let browser;
try {
  for (let i = 0; i < 50; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try {
      if ((await fetch(`${hostOrigin}/runtime.json`)).ok) break;
    } catch {}
    if (i === 49) throw new Error("Demo server did not start: " + serverLog);
    await delay(100);
  }
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
    console.error("Browser error:", error.message);
  });
  await mkdir("test-results", { recursive: true });
  async function launch(brand, inline = false, duration = 2) {
    await page.unrouteAll();
    await page.route("**/games/*/config", async (route) => {
      const response = await route.fetch();
      const config = await response.json();
      config.sdk.publicSettings.durationSeconds = duration;
      await route.fulfill({ response, json: config });
    });
    await page.goto(`${hostOrigin}/?brand=${brand}`);
    if (inline) {
      const select = page.locator("#presentation");
      if (await select.count()) await select.selectOption("inline");
      else
        await page
          .locator('.view-options label:has(input[value="inline"])')
          .click();
    }
    await page.locator("#launch").click();
    await expect(
      page.getByRole("button", { name: "Let’s play", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/${brand}-launcher.png` });
    await page.getByRole("button", { name: "Let’s play", exact: true }).click();
    await expect(page.locator("iframe")).toBeVisible({ timeout: 15000 });
    return page.frameLocator("iframe");
  }
  let frame = await launch("neutral");
  await expect(frame.locator("#start")).toBeEnabled();
  await frame.locator("#start").click();
  await expect(frame.locator("#score")).toBeEnabled();
  await frame.locator("#score").click();
  await page.evaluate((gameOrigin) => {
    const iframe = document
      .querySelector(".gc-launcher-host")
      .shadowRoot.querySelector("iframe");
    const sessionId = new URLSearchParams(
      new URL(iframe.src).hash.slice(1),
    ).get("gsSession");
    const data = {
      protocol: "gamescore",
      version: 1,
      sessionId,
      id: "forged",
      kind: "request",
      type: "session:close-requested",
    };
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: gameOrigin,
        source: window,
        data,
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://attacker.example",
        source: iframe.contentWindow,
        data,
      }),
    );
  }, gameOrigin);
  await expect(page.locator("[data-dismissal-dialog]")).toHaveCount(0);
  await frame.locator("#finish").click();
  await expect(page.locator("#status")).toContainText("10 points");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play Again", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play Again", exact: true }).click();
  await expect(page.frameLocator("iframe").locator("#start")).toBeEnabled({
    timeout: 15000,
  });
  await page.locator("#destroy").evaluate((button) => button.click());
  await expect(page.locator("iframe")).toHaveCount(0);
  console.log(
    "PASS neutral: cross-origin lifecycle, forged-message rejection, results, replay, disposal",
  );

  frame = await launch("glow", true, 2);
  await expect(frame.locator("#play")).toBeEnabled();
  await frame.locator("#play").click();
  await expect(page.locator("#status")).toContainText(
    /Saved (?:mock|demo) result/,
    {
      timeout: 15000,
    },
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  console.log(
    "PASS Catch Your Glow: inline start, timed finish, launcher result",
  );

  frame = await launch("sprint");
  await expect(page.locator("#status")).toContainText(
    /Saved (?:mock|demo) result/,
    {
      timeout: 15000,
    },
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  console.log(
    "PASS Sprint Challenge: Phaser initialization, automatic match start, result",
  );

  frame = await launch("glow", false, 30);
  await expect(frame.locator("#play")).toBeEnabled();
  await frame.locator("#play").click();
  await frame.getByRole("button", { name: "Close game" }).click();
  await expect(page.locator("[data-dismissal-dialog]")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(frame.locator("#overlay")).toBeHidden();
  await frame.getByRole("button", { name: "Close game" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  console.log("PASS close: pause, cancel/resume, confirmed abandonment");

  frame = await launch("glow", false, 1);
  let completions = 0;
  await page.route("**/matches/*/complete", async (route) => {
    completions++;
    if (completions === 1)
      await route.fulfill({
        status: 503,
        json: { message: "Temporary submission failure" },
      });
    else await route.continue();
  });
  await expect(frame.locator("#play")).toBeEnabled();
  await frame.locator("#play").click();
  await expect(frame.locator("#play")).toHaveText("Retry saving score", {
    timeout: 10000,
  });
  await expect(page.locator("iframe")).toHaveCount(1);
  await frame.locator("#play").click();
  await expect(page.locator("#status")).toContainText(
    /Saved (?:mock|demo) result/,
  );
  if (completions !== 2)
    throw new Error(`Expected two completion attempts, got ${completions}`);
  console.log(
    "PASS recovery: final progress retained, failed completion stays visible, retry succeeds",
  );

  await page.goto(hostOrigin);
  const protocolChecks = await page.evaluate(async (gameOrigin) => {
    const { createGameHost } = await import("/dist/host.js");
    const { createMockBackend } = await import("/testing/index.js");
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const failures = [];
    const host = createGameHost({
      iframe,
      gameUrl: `${gameOrigin}/sample/`,
      apiOrigin: location.origin,
      context: { gameId: "test", playerId: "test" },
      backend: createMockBackend(),
    });
    host.on("sdk:error", (error) => failures.push(error.code));
    await host.connect();
    const sessionId = new URLSearchParams(
      new URL(iframe.src).hash.slice(1),
    ).get("gsSession");
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin: gameOrigin,
        data: {
          protocol: "gamescore",
          version: 999,
          sessionId,
          id: "incompatible",
          kind: "request",
          type: "game:ready",
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        origin: gameOrigin,
        data: {
          protocol: "gamescore",
          version: 999,
          sessionId: "old-session",
          id: "stale",
          kind: "request",
          type: "game:ready",
        },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    host.destroy();
    iframe.remove();
    const blank = document.createElement("iframe");
    document.body.appendChild(blank);
    const timed = createGameHost({
      iframe: blank,
      gameUrl: `${gameOrigin}/missing/`,
      apiOrigin: location.origin,
      context: { gameId: "test", playerId: "test" },
      timeoutMs: 100,
    });
    try {
      await timed.connect();
    } catch (error) {
      failures.push(error.code);
    }
    timed.destroy();
    blank.remove();
    return failures;
  }, gameOrigin);
  if (
    JSON.stringify(protocolChecks) !==
    JSON.stringify(["PROTOCOL_MISMATCH", "TIMEOUT"])
  )
    throw new Error(JSON.stringify(protocolChecks));
  console.log(
    "PASS protocol: incompatible version, stale-session rejection, handshake timeout",
  );
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
