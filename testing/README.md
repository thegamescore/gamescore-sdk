# SDK testing tools

Private workspace `@gamescore/sdk-testing` contains mock connections/backends and the SDK's unit tests. It is excluded from the production SDK archive. The production SDK never imports this workspace.

From the root run `npm test` to build the SDK, build helpers into `testing/dist/`, and run tests. `npm run typecheck` covers all three workspaces. Browser tests belong to `examples/test/` and run with `npm run test:browser`.

For sibling practice-mode development, install `../game-sdk` and `../game-sdk/testing`. Replace the old `@gamescore/sdk/testing` import:

```ts
import { createGameSDK } from "@gamescore/sdk";
import { createMockConnection } from "@gamescore/sdk-testing";

const sdk = createGameSDK({
  connection: createMockConnection({ settings: { durationSeconds: 60 } }),
});
```

Mocks explicitly use the real session implementation from the SDK build. Build the SDK before the testing workspace. They are development helpers, not a production backend or an automatic fallback. Only use practice mode intentionally; create a fresh SDK/mock connection for each practice replay.
