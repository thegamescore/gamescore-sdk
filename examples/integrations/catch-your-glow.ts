import { createGameSDK, type Progress, type SDKError } from "@gamescore/sdk";

export function connectGlow(game: {
  configure(settings: Record<string, unknown>): void;
  start(): void;
  pause(): void;
  resume(): void;
  showError(error: SDKError): void;
}) {
  const sdk = createGameSDK<Progress>();
  sdk.on("session:initialized", ({ game: config }) =>
    game.configure(config.settings),
  );
  sdk.on("match:started", () => game.start());
  sdk.on("host:pause-requested", () => {
    game.pause();
    sdk.emit("gameplay:paused");
  });
  sdk.on("host:resume-requested", () => {
    game.resume();
    sdk.emit("gameplay:resumed");
  });
  sdk.on("sdk:error", game.showError);
  sdk.emit("game:ready");
  return {
    play: () => sdk.emit("match:start-requested"),
    finish: (
      state: { score: number; caught: number; hearts: number },
      activeSeconds: number,
    ) =>
      sdk.emit("match:end-requested", {
        score: state.score,
        elapsedMs: Math.round(activeSeconds * 1000),
        metrics: { caught: state.caught, heartsRemaining: state.hearts },
      }),
    paused: () => sdk.emit("gameplay:paused"),
    resumed: () => sdk.emit("gameplay:resumed"),
    close: () => sdk.emit("session:close-requested"),
    destroy: () => sdk.destroy(),
  };
}
