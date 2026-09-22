import { createGameSDK, type Progress, type SDKError } from "@gamescore/sdk";

export function connectSprint(game: {
  start(): void;
  pause(): void;
  resume(): void;
  showError(error: SDKError): void;
}) {
  const sdk = createGameSDK<Progress>();
  sdk.on("session:initialized", () => sdk.emit("match:start-requested"));
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
  sdk.emit("game:ready"); // Call connectSprint after the Phaser scene CREATE event.
  return {
    finish: (run: {
      score: number;
      elapsed: number;
      coins: number;
      complete: boolean;
      dead: boolean;
    }) =>
      sdk.emit("match:end-requested", {
        score: run.score,
        elapsedMs: Math.round(run.elapsed * 1000),
        metrics: {
          collected: run.coins,
          completed: run.complete,
          crashed: run.dead,
        },
      }),
    paused: () => sdk.emit("gameplay:paused"),
    resumed: () => sdk.emit("gameplay:resumed"),
    close: () => sdk.emit("session:close-requested"),
    destroy: () => sdk.destroy(),
  };
}
