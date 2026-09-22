# SDK setup

Use this guide to build `@gamescore/sdk`, connect a browser game, and mount it on a website. To try the existing games first, jump to [Run the local playground](#run-the-local-playground).

## Prerequisites

- Node.js 22 or newer and npm for repository development.
- A modern browser and a game served over HTTP or HTTPS.
- For real matches: the SDK-enabled GamesCore launcher, `nest-game-server`, and a configured campaign. The server can run locally or remotely; point `apiOrigin` at its URL. The SDK alone does not provide these services.

You do **not** need `nest-game-server` running locally to build the SDK, run tests, or use the local playground. The playground provides an in-memory mock backend for identities, scores, and rewards.

The package is not published to a registry. Start with a checkout of this repository. The game and website imports are browser APIs; initialize them on the client if your app uses server rendering.

## 1. Build and install

From the SDK checkout:

```sh
cd game-sdk
npm ci
npm run build
```

This creates ESM modules, TypeScript declarations, and the standalone browser script in `dist/`. No example repositories are needed to build the SDK.

From a sibling game project, install the built SDK:

```sh
cd ../my-game
npm install ../game-sdk
```

Install it in the embedding website project too if that is a separate app. Re-run `npm run build` in the SDK checkout after editing SDK source.

For an archive that can be shared without the checkout, run:

```sh
# In game-sdk; prepack builds the SDK automatically.
npm pack

# In the consuming project; adjust the path/version to the generated archive.
npm install /path/to/gamescore-sdk-0.1.0.tgz
```

Use `import { createGameSDK } from "@gamescore/sdk"` with your app's bundler. There is no CommonJS `require()` entry point.

For a game without a bundler, copy `dist/gamescore-sdk.js` to your game's public assets and load it before your integration script:

```html
<script src="/assets/gamescore-sdk.js"></script>
<script>
  const sdk = window.GameScoreSDK.createGameSDK();
  // Register your game handlers before emitting game:ready.
</script>
```

The standalone script exposes the game API. Use the `@gamescore/sdk/host` ESM entry point for the website integration.

## 2. Connect your game

Create one SDK instance per session. Wire the following sequence into your game's controls and engine:

| When                            | Action                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Initializing                    | Register listeners for `session:initialized`, `match:started`, `match:completed`, and `sdk:error`. Keep Play disabled. |
| Assets and handlers are ready   | Emit `game:ready` once.                                                                                                |
| Receiving `session:initialized` | Apply `game.settings` and enable Play.                                                                                 |
| Player presses Play             | Emit `match:start-requested` and disable Play while waiting.                                                           |
| Receiving `match:started`       | Apply optional `gameData`, then start gameplay and the active timer.                                                   |
| Game ends                       | Stop gameplay and the timer, then emit `match:end-requested` with `{ score, elapsedMs }`. Active time excludes pauses. |
| Receiving `match:completed`     | Display the authoritative server result.                                                                               |
| Page/component unmounts         | Call `sdk.destroy()` and stop your engine, audio, and listeners.                                                       |

`emit()` returns immediately; wait for the corresponding event before advancing. Handle host pause/resume requests by pausing/resuming your engine, timer, and audio, then emitting `gameplay:paused` or `gameplay:resumed`. Keep the game stopped after a submission error and offer a retry of `match:end-requested`; the SDK keeps the original final snapshot. Start or handshake failures require closing and reopening the session.

See the [README integration snippet](../README.md#install-in-another-game) and [full event reference](events.md) for payloads and error handling. Hosted replay uses a new launcher session; a completed SDK instance cannot start another match.

Opening your game directly does not create a host connection. For standalone practice, build the testing workspace with `npm run build:all` in this checkout, install `../game-sdk/testing` in your sibling game, and explicitly pass a mock connection as shown in [practice mode](configuration.md#explicit-practice-mode). Testing helpers are a separate private package and are not included in the SDK archive.

## 3. Configure the campaign and host website

Deploy the SDK-enabled server and updated launcher, then publish your game's static build. Through the existing authenticated panel APIs, configure the campaign's `settings.sdk` with:

- `protocolVersion: 1`.
- `gameUrl`: the deployed game's URL.
- `publicSettings`: settings that the game may read.
- `validation`: a server validation mode and appropriate score/time limits.

Use the [complete campaign configuration example](configuration.md#server-campaign) as the request body reference. The campaign UUID is the server's game UUID. The API must allow the embedding website's origin through CORS; match requests come from the parent website.

Add a mount target to the website:

```html
<div id="game-container"></div>
```

Then run this in the website's client-side module after the element exists, replacing the UUID and URLs with your deployment values:

```ts
import { mountCampaign } from "@gamescore/sdk/host";

const campaign = await mountCampaign({
  campaignId: "11111111-1111-4111-8111-111111111111",
  target: "#game-container",
  presentation: "inline",
  launcherUrl: "https://your-cdn.example/GameLauncher.min.js",
  apiOrigin: "https://your-api.example",
  gameOrigin: "https://your-games.example",
});

campaign.on("match:completed", (result) => console.log(result.score));
campaign.on("sdk:error", (error) => console.error(error.message));

// Call campaign.destroy() from your page/component cleanup handler.
```

Handle a rejected `mountCampaign()` promise in your website's error UI. Use `presentation: "modal"` for a modal instead. Only one campaign can be mounted at a time; destroy it before mounting another. When using `environment: "local"`, all three URL overrides are required.

Verify a full match in staging: initialization, start, pause/resume, completion, submission retry, close, and replay. See [server integration](server.md) for deployment order and validation details.

## Run the local playground

The playground uses a mock backend; no running Nest server or real campaign is required. It needs these sibling checkouts:

```text
your-workspace/
  game-sdk/
  game-launcher/
  catch-your-glow/
  sprint-challenge/
```

From `game-sdk`:

```sh
npm ci
npm run setup:examples
npm run dev
```

Setup installs and builds the sibling projects, builds the SDK/testing helpers, and copies the demo assets into `examples/vendor/`. Open <http://localhost:4210/?brand=glow>; embedded games use port 4211. Scores, identities, and rewards are in-memory mocks.

For checkouts in other locations:

```sh
npm run setup:examples -- \
  --launcher-path /absolute/path/to/game-launcher \
  --glow-path /absolute/path/to/catch-your-glow \
  --sprint-path /absolute/path/to/sprint-challenge
```

Use `--skip-install` only if sibling dependencies are already installed. Re-run setup after changing the launcher or example games; the dev server does not rebuild copied assets. See the repository's `examples/README.md` for browser tests and alternate ports.

## Troubleshooting

| Symptom                                             | Check                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cannot resolve `@gamescore/sdk` or its declarations | Build the SDK before installing a local checkout; verify that `dist/index.js` and `dist/index.d.ts` exist.                                                                         |
| Game never receives `session:initialized`           | Launch through the SDK-enabled host, register handlers before `game:ready`, and verify the campaign's SDK configuration. A directly opened page needs an explicit mock connection. |
| Launcher does not support SDK v1                    | Point `launcherUrl` at a deployed updated build. Building locally does not update the default CDN URL.                                                                             |
| Match requests fail with CORS errors                | Allow the embedding website origin in the API's CORS configuration.                                                                                                                |
| Example setup cannot find a sibling project         | Use the directory layout above or pass absolute setup paths.                                                                                                                       |
| Playground shows stale games                        | Re-run `npm run setup:examples` to refresh the copied assets.                                                                                                                      |
| A different launcher build is already loaded        | Reload the page before changing `launcherUrl`.                                                                                                                                     |
