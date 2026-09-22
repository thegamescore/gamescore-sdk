import test from "node:test";
import assert from "node:assert/strict";
import { createGameSDK } from "@gamescore/sdk";
import { createMockBackend, createMockConnection } from "../dist/index.js";
import { createSession, createHttpBackend } from "../../dist/session.js";
import { assertJson, isMessage } from "../../dist/protocol.js";

function next(sdk, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Missing ${type}`));
    }, 1000);
    const off = sdk.on(type, (value) => {
      clearTimeout(timer);
      off();
      resolve(value);
    });
  });
}
async function start(backend = createMockBackend()) {
  const sdk = createGameSDK({ connection: createMockConnection({ backend }) });
  const ready = next(sdk, "session:initialized");
  sdk.emit("game:ready");
  await ready;
  const started = next(sdk, "match:started");
  sdk.emit("match:start-requested");
  await started;
  return sdk;
}
const progress = { score: 80, elapsedMs: 1000, metrics: { caught: 4 } };

test("progress precedes completion and reports authoritative results", async () => {
  const backend = createMockBackend();
  const calls = [];
  const sdk = await start({
    ...backend,
    progress: async (...args) => {
      calls.push("progress");
      await backend.progress(...args);
    },
    complete: async (id) => {
      calls.push("complete");
      await backend.complete(id);
    },
    result: async (id) => {
      calls.push("result");
      return backend.result(id);
    },
  });
  sdk.emit("match:progress-reported", { ...progress, score: 20 });
  const completed = next(sdk, "match:completed");
  sdk.emit("match:end-requested", progress);
  const result = await completed;
  assert.equal(result.score, 80);
  assert.deepEqual(calls, ["progress", "progress", "complete", "result"]);
  sdk.destroy();
});
test("cannot start before initialization", async () => {
  const sdk = createGameSDK({ connection: createMockConnection() });
  const error = next(sdk, "sdk:error");
  sdk.emit("match:start-requested");
  assert.match((await error).message, /initialization/);
  sdk.destroy();
});
test("duplicate start and end signals execute once", async () => {
  const backend = createMockBackend();
  let starts = 0,
    ends = 0;
  const sdk = createGameSDK({
    connection: createMockConnection({
      backend: {
        ...backend,
        start: async () => {
          starts++;
          return backend.start();
        },
        complete: async (id) => {
          ends++;
          return backend.complete(id);
        },
      },
    }),
  });
  const ready = next(sdk, "session:initialized");
  sdk.emit("game:ready");
  sdk.emit("game:ready");
  await ready;
  const started = next(sdk, "match:started");
  sdk.emit("match:start-requested");
  sdk.emit("match:start-requested");
  await started;
  const completed = next(sdk, "match:completed");
  sdk.emit("match:end-requested", progress);
  sdk.emit("match:end-requested", progress);
  await completed;
  assert.equal(starts, 1);
  assert.equal(ends, 1);
  sdk.destroy();
});
test("lost progress reply retries the same sequence before completion", async () => {
  const backend = createMockBackend();
  let fail = true;
  const sequences = [];
  const sdk = await start({
    ...backend,
    progress: async (...args) => {
      sequences.push(args[1]);
      await backend.progress(...args);
      if (fail) {
        fail = false;
        throw new Error("Lost reply");
      }
    },
  });
  const error = next(sdk, "sdk:error");
  sdk.emit("match:progress-reported", progress);
  await error;
  const completed = next(sdk, "match:completed");
  sdk.emit("match:end-requested", progress);
  await completed;
  assert.deepEqual(sequences, [1, 1, 2]);
  sdk.destroy();
});
test("end retry preserves the original final snapshot", async () => {
  const backend = createMockBackend();
  let fail = true;
  const sdk = await start({
    ...backend,
    complete: async (id) => {
      await backend.complete(id);
      if (fail) {
        fail = false;
        throw new Error("Lost completion reply");
      }
    },
  });
  const error = next(sdk, "sdk:error");
  sdk.emit("match:end-requested", progress);
  await error;
  const lateProgress = next(sdk, "sdk:error");
  sdk.emit("match:progress-reported", { ...progress, score: 999 });
  assert.match((await lateProgress).message, /frozen/);
  const completed = next(sdk, "match:completed");
  sdk.emit("match:end-requested", { ...progress, score: 999 });
  assert.equal((await completed).score, 80);
  sdk.destroy();
});
test("pause does not complete or restart a match", async () => {
  const sdk = await start();
  let completed = false;
  sdk.on("match:completed", () => {
    completed = true;
  });
  sdk.emit("gameplay:paused");
  sdk.emit("gameplay:resumed");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(completed, false);
  sdk.destroy();
});
test("unknown start outcome is not retried", async () => {
  let starts = 0;
  const session = createSession(
    {
      ...createMockBackend(),
      start: async () => {
        starts++;
        throw new Error("Network lost");
      },
    },
    { campaignId: "test", game: { settings: {} } },
  );
  await session.request("game:ready");
  await assert.rejects(
    session.request("match:start-requested"),
    /Network lost/,
  );
  await assert.rejects(
    session.request("match:start-requested"),
    /outcome unknown/,
  );
  assert.equal(starts, 1);
});
test("dispose suppresses late results and removes listeners", async () => {
  let resolve;
  const sdk = createGameSDK({
    connection: {
      request: () =>
        new Promise((r) => {
          resolve = r;
        }),
      onEvent: () => () => {},
      destroy() {},
    },
  });
  let initialized = false;
  sdk.on("session:initialized", () => {
    initialized = true;
  });
  sdk.emit("game:ready");
  sdk.destroy();
  resolve({ campaignId: "test", game: { settings: {} } });
  await Promise.resolve();
  assert.equal(initialized, false);
});
test("HTTP adapter forwards source, clock and sequence, accepts 204", async () => {
  const requests = [];
  const backend = createHttpBackend({
    apiOrigin: "https://api.example",
    gameId: "game",
    playerId: "player",
    source: "partner",
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return url.endsWith("/complete")
        ? new Response(null, { status: 204 })
        : Response.json({ matchId: "match" });
    },
  });
  await backend.start();
  await backend.progress("match", 1, progress);
  await backend.complete("match");
  assert.equal(requests[0].headers["X-Source"], "partner");
  assert.equal(typeof JSON.parse(requests[0].body).clientTimestamp, "number");
  assert.equal(JSON.parse(requests[1].body).sequence, 1);
});
test("payload guard rejects non-JSON, non-finite, cyclic and oversized values", () => {
  for (const value of [
    { score: NaN },
    { x: undefined },
    { x: new Date() },
    "x".repeat(33000),
  ])
    assert.throws(() => assertJson(value));
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => assertJson(cyclic));
  assert.equal(isMessage({ protocol: "gamescore", kind: "request" }), false);
});
