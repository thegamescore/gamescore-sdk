# GamesCore playground

This private workspace owns the demo UI, event reference, campaign fixtures, mock HTTP server, sample game, integration adapters, generated vendor assets, and browser tests. None is included in the SDK package.

From the repository root, run `npm ci`, then `npm run setup:examples` and `npm run dev`. Setup requires the sibling `game-launcher`, `catch-your-glow`, and `sprint-challenge` repositories. It builds the SDK and separate testing helpers, builds each sibling, then copies generated assets into ignored `examples/vendor/` and writes provenance. Re-run after changing game or launcher source; the server does not rebuild files.

Open http://localhost:4210/?brand=glow. Games run cross-origin on port 4211. Scores, identities, and rewards are in-memory mocks. No real rewards are issued.

Setup flags: `npm run setup:examples -- --skip-install`, `--launcher-path /path`, `--glow-path /path`, and `--sprint-path /path`. Use absolute override paths. For alternate dev ports set `PORT` and `GAME_PORT`.

Run `npm run test:browser` from the root. Tests own a server on ports 4220/4221, so they do not collide with the playground. Override with `TEST_PORT` and `TEST_GAME_PORT`. Google Chrome is the default; use `PLAYWRIGHT_CHANNEL=chromium` for Playwright Chromium. Screenshots go to root `test-results/`.

The gallery imports the production SDK from `/dist/`; test-only mock helpers are exposed separately at `/testing/`. Game events are documented on the page and in `../docs/events.md`.
