import { createSession } from "../../dist/session.js";
import type { MatchBackend } from "@gamescore/sdk/host";
import {
  type Connection,
  type Json,
  type Progress,
  type Result,
} from "@gamescore/sdk";

export function createMockBackend(): MatchBackend {
  let id: string | undefined;
  let result: Result | undefined;
  const snapshots = new Map<number, string>();
  let score = 0;
  return {
    async start() {
      id ??= crypto.randomUUID();
      return { matchId: id };
    },
    async progress(matchId, sequence, payload) {
      if (id !== matchId) throw new Error("Unknown match");
      const signature = JSON.stringify(payload);
      if (snapshots.has(sequence)) {
        if (snapshots.get(sequence) !== signature)
          throw new Error("Conflicting sequence");
        return;
      }
      if (result || sequence !== snapshots.size + 1)
        throw new Error("Out of order progress");
      const p = payload as Progress;
      if (
        !Number.isFinite(p.score) ||
        p.score < 0 ||
        !Number.isFinite(p.elapsedMs) ||
        p.elapsedMs < 0
      )
        throw new Error("Invalid score or elapsedMs");
      snapshots.set(sequence, signature);
      score = p.score;
    },
    async complete(matchId) {
      if (id !== matchId || !snapshots.size) throw new Error("No progress");
      result ??= {
        matchId,
        score,
        status: "COMPLETED",
        immediateRewards: [],
        currentRank: null,
        mock: true,
      };
    },
    async result(matchId) {
      if (!result || result.matchId !== matchId)
        throw new Error("Not complete");
      return result;
    },
  };
}
export function createMockConnection(
  options: { settings?: Record<string, Json>; backend?: MatchBackend } = {},
): Connection {
  let session = createSession(options.backend ?? createMockBackend(), {
    campaignId: "mock-practice",
    game: { settings: options.settings ?? {} },
  });
  return {
    request: (type, payload) => session.request(type, payload),
    onEvent: () => () => {},
    destroy: () => session.destroy(),
  };
}
