# Configuration and branding

Configuration has three owners. Game code only receives public game settings.

| Owner           | Configuration                                                                             |
| --------------- | ----------------------------------------------------------------------------------------- |
| Server campaign | Game URL, SDK opt-in, public settings, server validation, branding, rewards, play limits  |
| Website         | Campaign UUID, mount target, presentation, endpoint overrides, optional source/order code |
| Game            | Event handlers; optional explicit mock connection for practice                            |

## Server campaign

Use the existing authenticated panel create/update endpoints. Campaign IDs remain the server's game UUIDs; no database migration is required. This is a complete SDK-enabled game creation body with no rewards:

```json
{
  "uuid": "11111111-1111-4111-8111-111111111111",
  "technicalName": "catch-your-glow",
  "settings": {
    "enabled": true,
    "matchesPerPlayer": 3,
    "matchesResetTime": 86400,
    "startDate": "2026-01-01T00:00:00Z",
    "endDate": "2099-01-01T00:00:00Z",
    "sdk": {
      "protocolVersion": 1,
      "gameUrl": "https://games.example.com/catch-your-glow/",
      "publicSettings": { "durationSeconds": 60, "startingLives": 3 },
      "validation": {
        "mode": "generic",
        "maxScore": 10000,
        "maxActiveTimeMs": 60000
      }
    },
    "display": {
      "title": "Catch your glow",
      "subtitle": "A little play. A little beauty.",
      "instructions": "Catch products. Avoid expired items.",
      "buttonText": "Start glowing",
      "emailGating": "disabled",
      "whitelabel": true,
      "hero": { "enabled": false },
      "theme": {
        "logoUrl": "https://assets.example.com/glow.svg",
        "colors": {
          "primary": "#be185d",
          "accent": "#f9a8d4",
          "background": "#fff7fb",
          "pageBackground": "#fce7f3",
          "text": "#4a1630",
          "textSecondary": "#4a1630"
        },
        "fonts": { "primary": "Arial", "heading": "Georgia" },
        "buttons": { "radius": "20px" }
      }
    },
    "rewards": []
  }
}
```

For Sprint Challenge, use its UUID, `technicalName: "sprint-challenge"`, its deployed URL, `publicSettings: { "durationSeconds": 45 }`, and `maxActiveTimeMs: 45000`. The example score cap is a campaign policy, not an anti-cheat guarantee; choose a cap appropriate to your scoring rules.

Existing reward, consent, order-gating, and per-source configuration continues to use the server's existing schemas. Secrets must never go into `publicSettings`. The public configuration response exposes only `protocolVersion`, `gameUrl`, and `publicSettings` from `settings.sdk`; validation stays server-side and is snapshotted when the match starts.

`publicSettings` is the configuration available before play. A registered server game-config sanitizer may additionally return per-match `gameData` in `match:started` (for example a generated level). Apply that data before starting the engine.

## Brand variants

The same game URL can be used by multiple campaigns. Change `display` without changing game code. The demo fixture [campaigns.mjs](../examples/campaigns.mjs) contains complete launcher configurations for:

| Brand       | Primary   | Accent    | Background | Font/button style |
| ----------- | --------- | --------- | ---------- | ----------------- |
| Glow Beauty | `#be185d` | `#f9a8d4` | `#fff7fb`  | Arial, rounded    |
| Sprint Club | `#a3e635` | `#22d3ee` | `#111827`  | Arial, compact    |
| GamesCore   | `#8b5cf6` | `#06b6d4` | `#0f172a`  | Arial, compact    |

Launcher branding is independent of game artwork. The SDK does not recolor sprites or replace in-game logos. Custom fonts must be loaded by the website. Theme variables are scoped to the launcher's shadow host and reset on disposal.

## Explicit practice mode

Mocks live in the separate, private `testing/` workspace and are not shipped in the SDK package. For sibling development, install `../game-sdk/testing` alongside `../game-sdk`.

```ts
import { createGameSDK } from "@gamescore/sdk";
import { createMockConnection } from "@gamescore/sdk-testing";

const sdk = createGameSDK({
  connection: createMockConnection({
    settings: { durationSeconds: 60, startingLives: 3 },
  }),
});
```

The two game examples explicitly select this adapter when running as top-level pages. Embedded games require a valid host connection; failures never trigger practice fallback. Create a new SDK/mock connection for each practice replay. Hosted replay belongs to the launcher.
