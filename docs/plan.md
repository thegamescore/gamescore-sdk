# Architecture and implementation record

## Decisions

- A framework-independent, event-only game API hides iframe and server plumbing.
- One package with game, host, and explicit testing exports; ESM/declarations and browser script output.
- Use the existing launcher renderer, configuration schemas, and match endpoints.
- Host owns identity, gates, HTTP, and results; game owns engine start/pause/stop and score payloads.
- Explicit generic scoring supports new games without new parsers; custom server parsers remain available.
- Active gameplay time excludes pauses; server expiry remains separate.
- Local Git repository; no automatic publishing or production deployment.

## Deliverables

- SDK core, versioned cross-origin transport, host bridge, HTTP adapter, and mock connection.
- Launcher integration with legacy fallback and scoped branding.
- Server opt-in configuration, generic validation/summary, sequenced progress, and completion deduplication.
- Catch Your Glow and Sprint Challenge integrations, compiled code examples, neutral reference game.
- Three branded launcher fixtures, static assets, reproducible example bootstrap, and demo server.
- Lifecycle/server tests, cross-origin browser checks, and documentation.

## Research

- [Poki SDK overview](https://developers.poki.com/guide/sdk-overview): loading readiness and gameplay transitions are distinct signals.
- [CrazyGames game API](https://docs.crazygames.com/sdk/game/): gameplay start/stop and loading events provide a useful lifecycle precedent.
- [MDN postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage): validate origin/source and use exact target origins.

These informed the design. The implementation uses its own event names and does not depend on those platform SDKs.
