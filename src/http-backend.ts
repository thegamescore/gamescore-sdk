import type { MatchBackend } from "./session.js";

export function createHttpBackend(options: {
  apiOrigin: string;
  gameId: string;
  playerId: string;
  source?: string | null;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): MatchBackend {
  const origin = options.apiOrigin.replace(/\/$/, "");
  const request = async (path: string, body?: unknown) => {
    const res = await (options.fetch ?? fetch)(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.source ? { "X-Source": options.source } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)])
        : AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw {
        code: `HTTP_${res.status}`,
        message:
          typeof data.message === "string"
            ? data.message
            : `Request failed (${res.status})`,
      };
    }
    return res.status === 204 ? undefined : res.json();
  };
  return {
    start: () =>
      request(`/matches/start/${encodeURIComponent(options.gameId)}`, {
        playerId: options.playerId,
        clientTimestamp: Date.now(),
      }),
    progress: async (id, sequence, progress) => {
      await request(`/matches/${encodeURIComponent(id)}/progress`, {
        sequence,
        progress,
      });
    },
    complete: async (id) => {
      await request(`/matches/${encodeURIComponent(id)}/complete`, {});
    },
    result: (id) => request(`/matches/${encodeURIComponent(id)}/result`),
  };
}
