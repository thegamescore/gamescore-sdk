import {
  PROTOCOL,
  VERSION,
  isMessage,
  failure,
  type Connection,
  type Command,
  type Message,
} from "./protocol.js";

export function createBrowserConnection(timeoutMs = 15000): Connection {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const sessionId = params.get("gsSession");
  const rawOrigin = params.get("gsHost");
  if (!sessionId || !rawOrigin || window.parent === window) {
    throw new Error(
      "No GamesCore host session. Use an explicit mock connection for practice.",
    );
  }
  const origin = new URL(rawOrigin).origin;
  if (!/^https?:\/\//.test(origin)) throw new Error("Invalid host origin");
  const pending = new Map<
    string,
    {
      type: string;
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
      timer: ReturnType<typeof setTimeout>;
      retry?: ReturnType<typeof setInterval>;
    }
  >();
  const listeners = new Set<(type: string, payload: unknown) => void>();
  let disposed = false;
  const receive = (event: MessageEvent) => {
    if (
      event.origin !== origin ||
      event.source !== window.parent ||
      !isMessage(event.data)
    )
      return;
    const m = event.data;
    if (m.sessionId !== sessionId) return;
    if (m.kind === "response") {
      const p = pending.get(m.id);
      if (!p || p.type !== m.type) return;
      clearTimeout(p.timer);
      clearInterval(p.retry);
      pending.delete(m.id);
      if (m.version !== VERSION)
        p.reject({
          code: "PROTOCOL_MISMATCH",
          message: "Unsupported host protocol",
        });
      else if (m.error) p.reject(m.error);
      else p.resolve(m.payload);
    } else if (m.kind === "event" && m.version === VERSION) {
      listeners.forEach((fn) => fn(m.type, m.payload));
    }
  };
  window.addEventListener("message", receive);
  return {
    request(type: Command, payload?: unknown) {
      if (disposed) return Promise.reject(new Error("SDK disposed"));
      const id = crypto.randomUUID();
      const message: Message = {
        protocol: PROTOCOL,
        version: VERSION,
        sessionId,
        id,
        kind: "request",
        type,
        payload,
      };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const p = pending.get(id);
          clearInterval(p?.retry);
          pending.delete(id);
          reject(
            failure(
              type,
              { code: "TIMEOUT", message: `${type} timed out` },
              id,
            ),
          );
        }, timeoutMs);
        const send = () => window.parent.postMessage(message, origin);
        const retry =
          type === "game:ready" ? setInterval(send, 500) : undefined;
        pending.set(id, { type, resolve, reject, timer, retry });
        send();
      });
    },
    onEvent(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    destroy() {
      disposed = true;
      window.removeEventListener("message", receive);
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        clearInterval(p.retry);
        p.reject(new Error("SDK disposed"));
      }
      pending.clear();
      listeners.clear();
    },
  };
}
