import {
  Emitter,
  assertJson,
  failure,
  type Connection,
  type InputEvents,
  type OutputEvents,
  type Progress,
  type Result,
  type Session,
  type Started,
} from "./protocol.js";
import { createBrowserConnection } from "./transport.js";
export type {
  Progress,
  Json,
  Session,
  Started,
  Result,
  SDKError,
  InputEvents,
  OutputEvents,
  Connection,
} from "./protocol.js";

export function createGameSDK<P = Progress>(
  options: { connection?: Connection; timeoutMs?: number } = {},
) {
  let connection = options.connection;
  const events = new Emitter<OutputEvents>();
  let state:
    | "new"
    | "connecting"
    | "ready"
    | "starting"
    | "playing"
    | "paused"
    | "ending"
    | "completed"
    | "failed"
    | "disposed" = "new";
  let sequence = 0;
  let queued = Promise.resolve();
  let pending: { sequence: number; progress: P } | undefined;
  let final: P | undefined;
  const getConnection = () => {
    if (!connection) connection = createBrowserConnection(options.timeoutMs);
    return connection;
  };
  const report = (operation: string, error: unknown) => {
    if (state !== "disposed")
      events.emit("sdk:error", failure(operation, error));
  };
  const flushPendingProgress = async () => {
    if (!pending) return;
    const item = pending;
    await getConnection().request("match:progress-reported", item);
    pending = undefined;
    sequence = item.sequence;
    if (state !== "disposed")
      events.emit("match:progress-accepted", { sequence });
  };
  const enqueue = (operation: string, action: () => Promise<void>) => {
    queued = queued
      .then(async () => {
        if (state !== "disposed") await action();
      })
      .catch((error) => report(operation, error));
  };

  const initializeSession = () => {
    const type = "game:ready";
    if (state !== "new") return;
    state = "connecting";
    const c = getConnection();
    c.onEvent((event) => {
      if (event === "host:pause-requested" || event === "host:resume-requested")
        events.emit(event, undefined);
    });
    void c
      .request(type)
      .then((data) => {
        if (state === "disposed") return;
        const session = data as Session;
        if (!session?.campaignId || !session.game?.settings)
          throw new Error("Invalid session response");
        state = "ready";
        events.emit("session:initialized", session);
      })
      .catch((error) => {
        if (state !== "disposed") state = "failed";
        report(type, error);
      });
  };

  const startMatch = () => {
    const type = "match:start-requested";
    if (state === "starting") return;
    if (state !== "ready")
      throw new Error("Match can only start after session initialization");
    state = "starting";
    void getConnection()
      .request(type)
      .then((data) => {
        if (state === "disposed") return;
        const match = data as Started;
        if (!match?.matchId) throw new Error("Invalid start response");
        state = "playing";
        events.emit("match:started", match);
      })
      .catch((error) => {
        if (state !== "disposed") state = "failed";
        report(type, error);
      });
  };

  const reportProgress = (payload: P) => {
    const type = "match:progress-reported";
    if (final !== undefined)
      throw new Error("Final score is frozen; retry completion instead");
    if (state !== "playing" && state !== "paused")
      throw new Error("No active match");
    assertJson(payload);
    const snapshot = structuredClone(payload);
    enqueue(type, async () => {
      await flushPendingProgress();
      pending = { sequence: sequence + 1, progress: snapshot };
      await flushPendingProgress();
    });
  };

  const endMatch = (payload: P) => {
    const type = "match:end-requested";
    if (state === "ending" || state === "completed") return;
    if (state !== "playing" && state !== "paused")
      throw new Error("No active match");
    assertJson(payload);
    if (final === undefined) final = structuredClone(payload);
    state = "ending";
    enqueue(type, async () => {
      try {
        await flushPendingProgress();
        const result = (await getConnection().request(type, {
          sequence: sequence + 1,
          progress: final,
        })) as Result;
        if (!result?.matchId || !Number.isFinite(result.score))
          throw new Error("Invalid completion response");
        if (state === "disposed") return;
        state = "completed";
        events.emit("match:completed", result);
        void getConnection()
          .request("session:result-received")
          .catch(() => {});
      } catch (error) {
        if (state !== "disposed") state = "paused";
        throw error;
      }
    });
  };

  const notifyHost = (
    type: "gameplay:paused" | "gameplay:resumed" | "session:close-requested",
  ) => {
    void getConnection()
      .request(type)
      .catch((error) => report(type, error));
  };
  const setGameplayState = (type: "gameplay:paused" | "gameplay:resumed") => {
    if (state !== "playing" && state !== "paused") return;
    state = type === "gameplay:paused" ? "paused" : "playing";
    notifyHost(type);
  };

  return {
    on: events.on.bind(events) as <K extends keyof OutputEvents>(
      type: K,
      handler: (payload: OutputEvents[K]) => void,
    ) => () => void,
    emit<K extends keyof InputEvents<P>>(
      type: K,
      ...args: InputEvents<P>[K] extends undefined ? [] : [InputEvents<P>[K]]
    ): void {
      if (state === "disposed") return;
      try {
        const payload = args[0] as P;
        switch (type) {
          case "game:ready":
            initializeSession();
            break;
          case "match:start-requested":
            startMatch();
            break;
          case "match:progress-reported":
            reportProgress(payload);
            break;
          case "match:end-requested":
            endMatch(payload);
            break;
          case "gameplay:paused":
          case "gameplay:resumed":
            setGameplayState(type);
            break;
          case "session:close-requested":
            notifyHost(type);
            break;
        }
      } catch (error) {
        report(type, error);
      }
    },
    destroy() {
      state = "disposed";
      connection?.destroy();
      events.clear();
    },
  };
}
