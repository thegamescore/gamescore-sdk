# Game events (protocol v1)

These are all 14 public events for `createGameSDK()` inside a game. The website API `mountCampaign()` exposes only `match:completed` and `sdk:error` through `campaign.on()`.

Register listeners before readiness: `sdk.on(name, handler)` returns an unsubscribe function. `sdk.emit(name, payload)` returns immediately, not a promise or confirmation. Omit the payload argument when the event has no payload. “Required handler” describes integration responsibilities; listener registration is not enforced by the SDK.

## Events emitted by the game

| Event                     | Requirement                   | Payload                                            | Usage                                                                                                                                                                                             |
| ------------------------- | ----------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game:ready`              | Required · once               | `No payload`                                       | Emit after assets are loaded and all handlers are registered. Wait for session:initialized before allowing start.                                                                                 |
| `match:start-requested`   | Required · per match          | `No payload`                                       | Emit from Play after session initialization. Start the engine and active timer only after match:started. Repeated requests while starting are coalesced.                                          |
| `match:progress-reported` | Optional · checkpoints        | `Progress (or your configured JSON payload)`       | Send snapshots while playing or paused, before ending. The SDK assigns sequences and serializes submissions. Acknowledged through match:progress-accepted.                                        |
| `match:end-requested`     | Required · to submit a result | `Final Progress (or your configured JSON payload)` | Stop the engine and active timer first. Emit while playing or paused, then wait for match:completed. The first final snapshot is frozen; retrying end after failure resubmits that same snapshot. |
| `gameplay:paused`         | Conditional · on pause        | `No payload`                                       | After actually pausing the engine, timer, and audio, report the change. Also acknowledge host:pause-requested this way. Only relevant to an active match.                                         |
| `gameplay:resumed`        | Conditional · on resume       | `No payload`                                       | After actually resuming the engine, timer, and audio, report the change. Also acknowledge host:resume-requested this way. Only relevant to an active match.                                       |
| `session:close-requested` | Optional · game close control | `No payload`                                       | Ask the launcher to show its close confirmation after initialization. Confirmed close abandons an unfinished match; it does not submit a result.                                                  |

## Events received by the game

| Event                     | Requirement                           | Payload                                                                    | Usage                                                                                                                                                                              |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session:initialized`     | Required handler                      | `{ campaignId: string, game: { settings: Record<string, Json> } }`         | Apply public game settings, then enable Play. This confirms game:ready; it does not start a match.                                                                                 |
| `match:started`           | Required handler                      | `{ matchId: string, gameData?: Json }`                                     | Apply any match-specific gameData, then start the simulation and active timer. This confirms the server created the match.                                                         |
| `match:progress-accepted` | Optional handler                      | `{ sequence: number }`                                                     | A queued progress snapshot was accepted. The SDK manages sequence numbers; the game must not add the transport envelope itself.                                                    |
| `match:completed`         | Required handler                      | `{ matchId: string, score: number, ...serverResult }`                      | The authoritative result is available. Show this result and finish submission UI. The SDK then automatically acknowledges receipt to the launcher.                                 |
| `host:pause-requested`    | Required when host pause is supported | `No payload`                                                               | Pause idempotently: if the match is running, pause your engine, timer, and audio, then emit gameplay:paused. Never blindly toggle pause.                                           |
| `host:resume-requested`   | Required when host pause is supported | `No payload`                                                               | If paused and still playable, resume your engine, timer, and audio, then emit gameplay:resumed. Do not resume a stopped game while its final result is being submitted or retried. |
| `sdk:error`               | Required for a usable integration     | `{ operation: string, requestId?: string, code: string, message: string }` | Show an actionable error. Handshake/start failure requires close and reopen. An end failure should keep the game stopped and allow retrying match:end-requested.                   |

## Required events and their order

The minimum successful round requires three requests and three confirmations:

```text
Game emits game:ready
  → Game receives session:initialized
  → Game emits match:start-requested
  → Game receives match:started
  → [Gameplay; optional progress and conditional pause/resume]
  → Stop the engine, then emit match:end-requested
  → Game receives match:completed
```

1. **Set up the game.** Create createGameSDK(), register handlers (including errors and host pause/resume), and load assets. Keep Play disabled.
2. **Emit game:ready.** Send once when the game is ready to connect. emit() returns immediately; it is not a server acknowledgement.
3. **Receive session:initialized.** Apply game.settings and enable Play. Do not run the match timer yet.
4. **Emit match:start-requested.** Send when the player chooses Play. Disable Play while waiting; do not begin gameplay yet.
5. **Receive match:started.** Apply optional gameData, start the engine, and start counting active milliseconds. Optional progress and pause/resume events occur here.
6. **Stop, then emit match:end-requested.** Freeze gameplay and send the final score, elapsedMs, and optional metrics. Keep the game visible while the result is saving.
7. **Receive match:completed.** Use the server result, not an assumed successful local score. If submission fails instead, show Retry and emit end again; the SDK preserves the original final snapshot.
8. **Clean up with sdk.destroy().** On page/component unmount, dispose the SDK and your own engine loops, audio, and listeners. destroy() is a method, not an event. A completed SDK instance cannot start another match; use a new launcher session.

Intermediate progress is optional. If your game supports host pause, handle both host requests and report the actual resulting state. Close is an alternative exit, not a result submission step. `session:result-received` is an internal receipt automatically sent after the game observes completion; never emit it yourself.

## Payloads

```ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Progress = {
  score: number;
  elapsedMs: number;
  metrics?: Record<string, Json>;
};

sdk.emit("match:end-requested", {
  score: 120,
  elapsedMs: 45000,
  metrics: { caught: 12, heartsRemaining: 2 },
});
```

The generic backend uses Progress. A custom `createGameSDK<P>()` may send a different JSON shape supported by its backend. Generic scores are finite and nonnegative; active milliseconds are nonnegative integers and exclude pauses. Scores may decrease; elapsed active time cannot. The browser limits JSON payloads to 32 KiB and 12 nesting levels. Report meaningful checkpoints, not animation frames.

## Delivery and lifecycle

- A match is created only after a start request. Loading and countdown do not consume active play time.
- Progress is serialized; failed snapshots are retained and retried with the same sequence before subsequent progress or completion.
- End freezes the first final snapshot. Retry end after failure to resend that same result, even if a new payload is supplied. Stop gameplay while submission is pending or being retried.
- Duplicate in-flight start/end signals are coalesced. A completed SDK instance cannot start another match.
- Completion failure puts the SDK in paused state for submission retry; that does not mean the game should resume gameplay.
- Confirmed close abandons unfinished play. It does not submit a winning result.
- `sdk.destroy()` disposes SDK listeners and pending browser requests, not your engine, audio, or timers. Clean those up separately.
- Pausing does not extend server inactivity limits. There is no heartbeat or reload persistence.

## Errors

`sdk:error` carries `{ operation, requestId?, code, message }`. Browser request IDs are included when available. Codes include `TIMEOUT`, `PROTOCOL_MISMATCH`, `HTTP_<status>`, and `REQUEST_FAILED`.

| Failure                             | Recovery                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Handshake timeout/version mismatch  | Check deployed SDK/launcher versions and iframe URL; close/reopen         |
| Start rejected or reply lost        | Do not start the game; close/reopen to recheck play limits                |
| Final submission/network failure    | Keep the stopped game visible and offer a retry button emitting end again |
| Invalid progress                    | Correct the integration; retained invalid progress will continue to fail  |
| Result fetch fails after completion | Retry end; server completion and final progress are idempotent            |

An ambiguous start can already have consumed an attempt. The SDK intentionally does not automatically submit another start. No production offline-score queue is provided.

## Internal transport

The host adds `gsHost` and a random `gsSession` to the iframe URL fragment. Each message includes protocol, version, session ID, request ID, kind, type, and payload. Both directions validate the sender window and exact origin; messages from other sessions are ignored. Handshakes retry every 500 ms for up to 15 seconds. HTTP operations have a 12-second timeout. Mutating HTTP operations are not automatically retried.

The fragment binds the frame to its host; it is not a server authorization token. Existing server endpoint authentication rules still apply. Generic client-reported scores are not cheat-proof. No credentials or private campaign configuration are sent to the game.
