import {
  Emitter,
  assertJson,
  type Command,
  type Result,
  type Session,
  type Started,
} from "./protocol.js";

export { createHttpBackend } from "./http-backend.js";

export interface MatchBackend {
  start(): Promise<Started>;
  progress(matchId: string, sequence: number, progress: unknown): Promise<void>;
  complete(matchId: string): Promise<void>;
  result(matchId: string): Promise<Result>;
}
export interface HostEvents {
  "match:completed": Result;
  "session:close-requested": undefined;
  "gameplay:paused": undefined;
  "gameplay:resumed": undefined;
}
interface ProgressReport {
  sequence: number;
  progress: unknown;
}

function parseProgressReport(payload: unknown): ProgressReport {
  const data = payload as ProgressReport;
  if (!data || !Number.isSafeInteger(data.sequence) || data.sequence < 1)
    throw new Error("Invalid progress sequence");
  assertJson(data.progress);
  return data;
}

export function createSession(backend: MatchBackend, session: Session) {
  const events = new Emitter<HostEvents>();
  let ready = false;
  let started: Started | undefined;
  let startRequested = false;
  let completed: Result | undefined;
  let delivered = false;
  let final: string | undefined;
  let tail = Promise.resolve<unknown>(undefined);
  let disposed = false;
  const startMatch = async () => {
    if (started) return started;
    if (startRequested)
      throw new Error(
        "Start outcome unknown. Close and reopen the launcher to recheck play limits.",
      );
    startRequested = true;
    started = await backend.start();
    return started;
  };
  const acknowledgeResult = () => {
    if (!completed) throw new Error("No completed result");
    if (!delivered) {
      delivered = true;
      events.emit("match:completed", completed);
    }
    return null;
  };
  const completeMatch = async (matchId: string, data: ProgressReport) => {
    const signature = JSON.stringify(data);
    if (final && final !== signature)
      throw new Error("Final progress cannot change on retry");
    final = signature;
    if (completed) return completed;
    await backend.progress(matchId, data.sequence, data.progress);
    await backend.complete(matchId);
    const result = await backend.result(matchId);
    if (result.matchId !== matchId || !Number.isFinite(result.score)) {
      throw new Error("Invalid match result response");
    }
    completed = result;
    return completed;
  };

  const process = async (
    type: Command,
    payload?: unknown,
  ): Promise<unknown> => {
    if (disposed) throw new Error("Session disposed");
    if (type === "game:ready") {
      ready = true;
      return session;
    }
    if (!ready) throw new Error("Game is not ready");
    if (type === "session:close-requested") {
      events.emit(type, undefined);
      return null;
    }
    if (type === "match:start-requested") {
      return startMatch();
    }
    if (!started) throw new Error("No active match");
    if (type === "session:result-received") {
      return acknowledgeResult();
    }
    if (type === "gameplay:paused" || type === "gameplay:resumed") {
      if (!final) events.emit(type, undefined);
      return null;
    }
    if (type === "match:progress-reported" || type === "match:end-requested") {
      const data = parseProgressReport(payload);
      if (type === "match:progress-reported") {
        if (final) throw new Error("Match is ending");
        await backend.progress(started.matchId, data.sequence, data.progress);
        return { sequence: data.sequence };
      }
      return completeMatch(started.matchId, data);
    }
    throw new Error("Unknown command");
  };
  return {
    on: events.on.bind(events),
    request(type: Command, payload?: unknown) {
      const task = tail.then(() => process(type, payload));
      tail = task.catch(() => {});
      return task;
    },
    destroy() {
      disposed = true;
      events.clear();
    },
  };
}
