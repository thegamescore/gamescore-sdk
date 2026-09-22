export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Progress {
  score: number;
  elapsedMs: number;
  metrics?: Record<string, Json>;
}
export interface Session {
  campaignId: string;
  game: { settings: Record<string, Json> };
}
export interface Started {
  matchId: string;
  gameData?: Json;
}
export interface Result {
  matchId: string;
  score: number;
  [key: string]: unknown;
}
export interface SDKError {
  operation: string;
  requestId?: string;
  code: string;
  message: string;
}
export interface InputEvents<P> {
  "game:ready": undefined;
  "match:start-requested": undefined;
  "match:progress-reported": P;
  "match:end-requested": P;
  "gameplay:paused": undefined;
  "gameplay:resumed": undefined;
  "session:close-requested": undefined;
}
export interface OutputEvents {
  "session:initialized": Session;
  "match:started": Started;
  "match:progress-accepted": { sequence: number };
  "match:completed": Result;
  "host:pause-requested": undefined;
  "host:resume-requested": undefined;
  "sdk:error": SDKError;
}
export type Command = keyof InputEvents<unknown> | "session:result-received";
export interface Connection {
  request(type: Command, payload?: unknown): Promise<unknown>;
  onEvent(handler: (type: string, payload: unknown) => void): () => void;
  destroy(): void;
}
export const PROTOCOL = "gamescore";
export const VERSION = 1;
export const commands = new Set<string>([
  "game:ready",
  "match:start-requested",
  "match:progress-reported",
  "match:end-requested",
  "gameplay:paused",
  "gameplay:resumed",
  "session:close-requested",
  "session:result-received",
]);
export interface Message {
  protocol: typeof PROTOCOL;
  version: number;
  sessionId: string;
  id: string;
  kind: "request" | "response" | "event";
  type: string;
  payload?: unknown;
  error?: SDKError;
}
export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const m = value as Message;
  return (
    m.protocol === PROTOCOL &&
    Number.isInteger(m.version) &&
    typeof m.sessionId === "string" &&
    m.sessionId.length <= 100 &&
    typeof m.id === "string" &&
    m.id.length > 0 &&
    m.id.length <= 100 &&
    ["request", "response", "event"].includes(m.kind) &&
    typeof m.type === "string" &&
    m.type.length < 100
  );
}
export function failure(
  operation: string,
  error: unknown,
  requestId?: string,
): SDKError {
  const e = error as Partial<SDKError> | undefined;
  return {
    operation,
    requestId: requestId ?? e?.requestId,
    code: typeof e?.code === "string" ? e.code : "REQUEST_FAILED",
    message: e?.message || String(error),
  };
}
export function assertJson(value: unknown): void {
  const visit = (item: unknown, depth: number): void => {
    if (depth > 12) throw new Error("Payload nesting exceeds 12 levels");
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return;
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (Array.isArray(item)) {
      item.forEach((v) => visit(v, depth + 1));
      return;
    }
    if (
      item &&
      typeof item === "object" &&
      Object.getPrototypeOf(item) === Object.prototype
    ) {
      Object.values(item).forEach((v) => visit(v, depth + 1));
      return;
    }
    throw new Error("Payload must contain JSON values only");
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 32768) {
    throw new Error("Payload exceeds 32 KiB");
  }
}
export class Emitter<E> {
  private listeners = new Map<keyof E, Set<(payload: any) => void>>();
  on<K extends keyof E>(type: K, handler: (payload: E[K]) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
    return () => {
      set.delete(handler);
    };
  }
  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const handler of [...(this.listeners.get(type) ?? [])]) {
      // Consumer handlers must not change the outcome of an acknowledged operation.
      try {
        handler(payload);
      } catch (error) {
        console.error("GamesCore event handler:", error);
      }
    }
  }
  clear(): void {
    this.listeners.clear();
  }
}
