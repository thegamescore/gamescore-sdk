# GamesCore SDK

Connect a browser game to the GamesCore launcher and game server using typed events. Games do not call HTTP endpoints, manage player IDs, or send iframe messages themselves.

Start with the [SDK setup guide](docs/setup.md) for prerequisites, installation, game integration, campaign hosting, and the local playground.

```text
Game → @gamescore/sdk → iframe event bridge → SDK host → Nest game server
                                                   ↳ existing branded launcher
```

## Install in another game

This package is not published. For sibling development:

```sh
npm install ../game-sdk
```

For distribution, run `npm pack` in this repository and install the resulting `.tgz`. The package includes ESM, declarations, and `dist/gamescore-sdk.js`, a script build exposing `window.GameScoreSDK`.

```ts
import { createGameSDK } from "@gamescore/sdk";

const sdk = createGameSDK();
sdk.on("session:initialized", ({ game }) => configureGame(game.settings));
sdk.on("match:started", () => startSimulation());
sdk.on("sdk:error", (error) => showError(error.message));

// After assets are loaded and handlers are registered:
sdk.emit("game:ready");

// From the play button:
sdk.emit("match:start-requested");

// After stopping the simulation:
sdk.emit("match:end-requested", {
  score: 120,
  elapsedMs: 45000,
  metrics: { collected: 12 },
});
```

The functions above are engine hooks. See the [complete event reference and required order](docs/events.md) for completion, pause/resume, error recovery, and cleanup. Example adapters live separately under `examples/integrations/` in the repository.

`emit()` returns immediately. It does **not** mean the server accepted the action. Only start your simulation after `match:started`. Keep results visible until `match:completed`; retry a failed end by emitting `match:end-requested` again. The SDK preserves the original final snapshot.

## Mount a campaign on a website

```ts
import { mountCampaign } from "@gamescore/sdk/host";

const campaign = await mountCampaign({
  campaignId: "11111111-1111-4111-8111-111111111111",
  target: "#game-container",
  presentation: "inline", // or 'modal'
  launcherUrl: "https://your-cdn.example/GameLauncher.min.js",
  apiOrigin: "https://your-api.example",
  gameOrigin: "https://your-games.example",
});

campaign.on("match:completed", (result) => console.log(result.score));
// On page/component unmount:
campaign.destroy();
```

Deploy the updated launcher before pointing the SDK at a production URL. The default launcher URL is the existing GamesCore CDN location; this change does not publish a new build there. API/game origins can be supplied at mount time or inherited from the launcher's build configuration. Only one campaign is mounted at a time. Destroy it before mounting another.

## Documentation

- [SDK setup guide](docs/setup.md)
- [Configuration and branding](docs/configuration.md)
- [Events, lifecycle, errors, and transport](docs/events.md)
- [Server integration and legacy migration](docs/server.md)

## Repository boundaries

- `src/` → production SDK and host runtime. `npm run build` creates only SDK files in `dist/`.
- `testing/` → private `@gamescore/sdk-testing` workspace, mock backends/connections, unit tests, and package-boundary checks.
- `examples/` → private playground workspace, campaign fixtures, games, integration adapters, setup, and browser tests.
- `docs/` → SDK reference documentation; the development plan is excluded from the package.

Only the compiled runtime, this README, the setup guide, and the three SDK reference documents ship in `npm pack`. The SDK has no runtime dependencies on examples, tests, or mocks. Public production imports remain `@gamescore/sdk` and `@gamescore/sdk/host`.

The former `@gamescore/sdk/testing` subpath has moved to `@gamescore/sdk-testing`. For local practice tooling, install `../game-sdk/testing` separately. It is a private development workspace and is not shipped in the SDK archive.

## Local development

From a repository checkout (Node 22+):

```sh
npm ci
npm run build:all       # SDK plus separate testing helpers
npm test               # unit tests and package boundaries
npm run typecheck      # SDK, testing helpers, example adapters
npm run format         # format maintained source and documentation
npm run format:check   # verify formatting without changes
npm run setup:examples # build and copy the sibling example games
npm run dev            # playground on localhost:4210
npm run test:browser   # separate browser suite on ports 4220/4221
```

Example prerequisites and setup flags are documented in `examples/README.md`; test commands and mock usage are documented in `testing/README.md` in the repository.
