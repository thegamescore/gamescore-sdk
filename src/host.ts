import {
  Emitter,
  PROTOCOL,
  VERSION,
  commands,
  isMessage,
  failure,
  type Command,
  type Json,
  type Message,
  type SDKError,
} from "./protocol.js";
import {
  createSession,
  type MatchBackend,
  type HostEvents,
} from "./session.js";
import { createHttpBackend } from "./http-backend.js";
export { createHttpBackend } from "./http-backend.js";
export { mountCampaign, type MountOptions } from "./campaign.js";
export type { MatchBackend, HostEvents } from "./session.js";

export interface HostOptions {
  iframe: HTMLIFrameElement;
  gameUrl: string;
  apiOrigin: string;
  context: {
    gameId: string;
    playerId: string;
    nickname?: string;
    source?: string | null;
  };
  settings?: Record<string, Json>;
  backend?: MatchBackend;
  timeoutMs?: number;
}
export function createGameHost(options: HostOptions) {
  const id = crypto.randomUUID();
  const url = new URL(options.gameUrl, window.location.href);
  if (!/^https?:$/.test(url.protocol))
    throw new Error("Game URL must use HTTP(S)");
  const hash = new URLSearchParams(url.hash.slice(1));
  hash.set("gsHost", window.location.origin);
  hash.set("gsSession", id);
  url.hash = hash.toString();
  const abort = new AbortController();
  const session = createSession(
    options.backend ??
      createHttpBackend({
        ...options.context,
        apiOrigin: options.apiOrigin,
        signal: abort.signal,
      }),
    {
      campaignId: options.context.gameId,
      game: { settings: options.settings ?? {} },
    },
  );
  const errors = new Emitter<{ "sdk:error": SDKError }>();
  const replies = new Map<
    string,
    { signature: string; task: Promise<Message> }
  >();
  let disposed = false;
  let connected = false;
  let connectResolve: () => void;
  let connectReject: (e: unknown) => void;
  let timeout: ReturnType<typeof setTimeout>;
  let connecting: Promise<void> | undefined;
  const send = (message: Message) => {
    if (!disposed)
      options.iframe.contentWindow?.postMessage(message, url.origin);
  };
  const sendEvent = (
    type: "host:pause-requested" | "host:resume-requested",
  ) => {
    send({
      protocol: PROTOCOL,
      version: VERSION,
      sessionId: id,
      id: crypto.randomUUID(),
      kind: "event",
      type,
    });
  };
  const createResponse = async (m: Message): Promise<Message> => {
    const response: Message = {
      ...m,
      version: VERSION,
      kind: "response",
      payload: undefined,
    };
    try {
      if (m.version !== VERSION)
        throw {
          code: "PROTOCOL_MISMATCH",
          message: "Unsupported game protocol",
        };
      response.payload = await session.request(m.type as Command, m.payload);
      if (m.type === "game:ready" && !connected) {
        connected = true;
        clearTimeout(timeout);
        connectResolve?.();
      }
    } catch (error) {
      response.error = failure(m.type, error, m.id);
      errors.emit("sdk:error", response.error);
    }
    return response;
  };
  const receive = (event: MessageEvent) => {
    if (
      disposed ||
      event.source !== options.iframe.contentWindow ||
      event.origin !== url.origin ||
      !isMessage(event.data)
    )
      return;
    const m = event.data;
    if (m.sessionId !== id || m.kind !== "request" || !commands.has(m.type))
      return;
    const signature = JSON.stringify([m.type, m.payload]);
    const existing = replies.get(m.id);
    if (existing && existing.signature !== signature) return;
    let task = existing?.task;
    if (!task) {
      task = createResponse(m);
      replies.set(m.id, { signature, task });
      if (replies.size > 256) replies.delete(replies.keys().next().value!);
    }
    void task.then(send);
  };
  window.addEventListener("message", receive);
  return {
    on<K extends keyof HostEvents | "sdk:error">(
      type: K,
      handler: (
        payload: K extends keyof HostEvents ? HostEvents[K] : SDKError,
      ) => void,
    ): () => void {
      return type === "sdk:error"
        ? errors.on(type, handler as (e: SDKError) => void)
        : session.on(
            type as keyof HostEvents,
            handler as (e: HostEvents[keyof HostEvents]) => void,
          );
    },
    connect(): Promise<void> {
      if (disposed) return Promise.reject(new Error("Host disposed"));
      if (!connecting) {
        connecting = new Promise<void>((resolve, reject) => {
          connectResolve = resolve;
          connectReject = reject;
          timeout = setTimeout(() => {
            const error = failure("game:ready", {
              code: "TIMEOUT",
              message: "Game did not connect",
            });
            errors.emit("sdk:error", error);
            disposed = true;
            abort.abort();
            window.removeEventListener("message", receive);
            session.destroy();
            reject(error);
          }, options.timeoutMs ?? 15000);
          options.iframe.src = url.href;
        });
      }
      return connecting;
    },
    pause() {
      sendEvent("host:pause-requested");
    },
    resume() {
      sendEvent("host:resume-requested");
    },
    destroy() {
      disposed = true;
      clearTimeout(timeout);
      abort.abort();
      if (!connected) connectReject?.(new Error("Host disposed"));
      window.removeEventListener("message", receive);
      session.destroy();
      errors.clear();
      replies.clear();
    },
  };
}
