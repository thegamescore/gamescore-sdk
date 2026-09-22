# Server integration and migration

## Existing endpoints

The host handles all calls. Games only emit events.

| Endpoint                          | Body/behavior                                        |
| --------------------------------- | ---------------------------------------------------- |
| `POST /matches/start/:gameId`     | `{ playerId, clientTimestamp }`; optional `X-Source` |
| `POST /matches/:matchId/progress` | `{ sequence, progress }` for SDK matches             |
| `POST /matches/:matchId/complete` | Completes acknowledged progress; HTTP 204            |
| `GET /matches/:matchId/result`    | Authoritative score and existing rewards/rank fields |

SDK match mutations use a per-match ownership-checked Redis lease, renewed during work. Accepted progress stores its sequence and payload signature in the existing Redis progress list. Duplicate identical progress is acknowledged; conflicting sequence reuse and skipped sequences fail. Completion retries do not repeat match writes or completion metrics. Reward evaluation uses a stable BullMQ job ID; a completion retry re-enqueues that same job to recover a prior enqueue failure.

The existing Redis/Postgres/queue writes are not a single distributed transaction. This change supports request retries, not an exactly-once guarantee across a server crash. A crash after persistence and before reward enqueue still requires a retry or operational reconciliation. No database schema migration is introduced.

The API origin must permit the **embedding website origin** through its existing CORS configuration. The parent host now makes the match requests. Existing player registration, consent, cooldown, order reservation, and source attribution stay in the launcher/server.

## Validation modes

`settings.sdk.validation.mode = "generic"` selects the common score contract. Configure `maxScore` and `maxActiveTimeMs`. The server validates shape, size, score bounds, increasing active time, and active time not exceeding server wall time plus a 3-second tolerance. Summary score is the last accepted score; snapshots do not become levels.

`mode = "custom"` selects the existing parser registered for the campaign's `technicalName`. Register its static Zod schema and `GameParser` through the existing `GameParserProvider` mechanism and `GameParsersModule`. Use `createGameSDK<YourProgress>()` in the game. Custom parsers retain the existing summary contract (`totalScore` and any existing level/hit fields). Put server-only data in `gameConfig`, and use a registered sanitizer for public per-match `gameData`.

Missing parsers never enable generic scoring implicitly. The game cannot choose its validation mode. Changing a campaign's SDK policy does not change an already-started match's snapshotted mode/limits.

## Migration

1. Deploy server support for `settings.sdk`, sequencing, generic summaries, and completion deduplication.
2. Deploy the updated launcher. Campaigns without `settings.sdk` retain legacy `gameReady/init/gameOver/close` messages.
3. Install/build the SDK in a game; replace raw messaging and match HTTP code with SDK events.
4. Publish the game's static build and configure its campaign's SDK URL, public settings, and validation policy.
5. Verify a full match, pause, submission retry, close, and replay against a staging server.

Use the existing authenticated panel APIs for campaign configuration. Both create and update schemas accept the new SDK field. The public campaign endpoint strips validation policy from the SDK configuration.

To roll back a campaign, restore its previous game URL/configuration and legacy game build together. Removing SDK opt-in while leaving an SDK-only game deployed will prevent its handshake.
