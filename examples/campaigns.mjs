export const ids = {
  glow: "11111111-1111-4111-8111-111111111111",
  sprint: "22222222-2222-4222-8222-222222222222",
  neutral: "33333333-3333-4333-8333-333333333333",
};
export function campaigns(hostOrigin, gameOrigin) {
  const make = (
    key,
    title,
    subtitle,
    primary,
    accent,
    background,
    text,
    game,
    settings,
  ) => ({
    campaignId: ids[key],
    enabled: true,
    startDate: "2020-01-01T00:00:00Z",
    endDate: "2099-01-01T00:00:00Z",
    display: {
      title,
      subtitle,
      badge: "LOCAL DEMO · MOCK REWARDS",
      buttonText: "Let’s play",
      instructions:
        "Play a round. Your score returns to this launcher automatically.",
      emailGating: "disabled",
      whitelabel: true,
      hero: { enabled: false },
      countdownFacts: [
        "This is a local SDK example. No real rewards are issued.",
      ],
      theme: {
        logoUrl: `${hostOrigin}/examples/brands/${key}.svg`,
        colors: {
          primary,
          accent,
          background,
          pageBackground: background,
          text,
          textSecondary: text,
        },
        fonts: { primary: "Arial", heading: "Arial" },
        buttons: { radius: key === "glow" ? "20px" : "6px" },
      },
    },
    sdk: {
      protocolVersion: 1,
      gameUrl: `${gameOrigin}/${game}/`,
      publicSettings: settings,
    },
    rewards: [
      {
        id: "demo-reward",
        type: "THRESHOLD",
        timing: "IMMEDIATE",
        order: 0,
        config: { minScore: 50 },
        display: {
          icon: "★",
          instructions: {
            title: "Demo reward",
            text: "Score 50 points to unlock a simulated reward.",
          },
          rewards: {
            title: "Demo reward",
            text: "Simulated reward — no monetary value.",
          },
        },
      },
    ],
  });
  return {
    [ids.glow]: make(
      "glow",
      "Catch your glow",
      "A little play. A little beauty.",
      "#be185d",
      "#f9a8d4",
      "#fff7fb",
      "#4a1630",
      "glow",
      { durationSeconds: 60, startingLives: 3 },
    ),
    [ids.sprint]: make(
      "sprint",
      "Sprint Club",
      "Flip gravity. Find your next gear.",
      "#a3e635",
      "#22d3ee",
      "#111827",
      "#ffffff",
      "sprint",
      { durationSeconds: 45 },
    ),
    [ids.neutral]: make(
      "neutral",
      "GamesCore Arcade",
      "One SDK. Any browser game.",
      "#8b5cf6",
      "#06b6d4",
      "#0f172a",
      "#ffffff",
      "sample",
      { durationSeconds: 10 },
    ),
  };
}
