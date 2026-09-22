// Public event contract verified against src/protocol.ts and src/index.ts.
export const emittedEvents = [
  [
    "game:ready",
    "Required · once",
    "No payload",
    "Emit after assets are loaded and all handlers are registered. Wait for session:initialized before allowing start.",
  ],
  [
    "match:start-requested",
    "Required · per match",
    "No payload",
    "Emit from Play after session initialization. Start the engine and active timer only after match:started. Repeated requests while starting are coalesced.",
  ],
  [
    "match:progress-reported",
    "Optional · checkpoints",
    "Progress (or your configured JSON payload)",
    "Send snapshots while playing or paused, before ending. The SDK assigns sequences and serializes submissions. Acknowledged through match:progress-accepted.",
  ],
  [
    "match:end-requested",
    "Required · to submit a result",
    "Final Progress (or your configured JSON payload)",
    "Stop the engine and active timer first. Emit while playing or paused, then wait for match:completed. The first final snapshot is frozen; retrying end after failure resubmits that same snapshot.",
  ],
  [
    "gameplay:paused",
    "Conditional · on pause",
    "No payload",
    "After actually pausing the engine, timer, and audio, report the change. Also acknowledge host:pause-requested this way. Only relevant to an active match.",
  ],
  [
    "gameplay:resumed",
    "Conditional · on resume",
    "No payload",
    "After actually resuming the engine, timer, and audio, report the change. Also acknowledge host:resume-requested this way. Only relevant to an active match.",
  ],
  [
    "session:close-requested",
    "Optional · game close control",
    "No payload",
    "Ask the launcher to show its close confirmation after initialization. Confirmed close abandons an unfinished match; it does not submit a result.",
  ],
];
export const receivedEvents = [
  [
    "session:initialized",
    "Required handler",
    "{ campaignId: string, game: { settings: Record<string, Json> } }",
    "Apply public game settings, then enable Play. This confirms game:ready; it does not start a match.",
  ],
  [
    "match:started",
    "Required handler",
    "{ matchId: string, gameData?: Json }",
    "Apply any match-specific gameData, then start the simulation and active timer. This confirms the server created the match.",
  ],
  [
    "match:progress-accepted",
    "Optional handler",
    "{ sequence: number }",
    "A queued progress snapshot was accepted. The SDK manages sequence numbers; the game must not add the transport envelope itself.",
  ],
  [
    "match:completed",
    "Required handler",
    "{ matchId: string, score: number, ...serverResult }",
    "The authoritative result is available. Show this result and finish submission UI. The SDK then automatically acknowledges receipt to the launcher.",
  ],
  [
    "host:pause-requested",
    "Required when host pause is supported",
    "No payload",
    "Pause idempotently: if the match is running, pause your engine, timer, and audio, then emit gameplay:paused. Never blindly toggle pause.",
  ],
  [
    "host:resume-requested",
    "Required when host pause is supported",
    "No payload",
    "If paused and still playable, resume your engine, timer, and audio, then emit gameplay:resumed. Do not resume a stopped game while its final result is being submitted or retried.",
  ],
  [
    "sdk:error",
    "Required for a usable integration",
    "{ operation: string, requestId?: string, code: string, message: string }",
    "Show an actionable error. Handshake/start failure requires close and reopen. An end failure should keep the game stopped and allow retrying match:end-requested.",
  ],
];

const steps = [
  [
    "Set up the game",
    "Create createGameSDK(), register handlers (including errors and host pause/resume), and load assets. Keep Play disabled.",
  ],
  [
    "Emit game:ready",
    "Send once when the game is ready to connect. emit() returns immediately; it is not a server acknowledgement.",
  ],
  [
    "Receive session:initialized",
    "Apply game.settings and enable Play. Do not run the match timer yet.",
  ],
  [
    "Emit match:start-requested",
    "Send when the player chooses Play. Disable Play while waiting; do not begin gameplay yet.",
  ],
  [
    "Receive match:started",
    "Apply optional gameData, start the engine, and start counting active milliseconds. Optional progress and pause/resume events occur here.",
  ],
  [
    "Stop, then emit match:end-requested",
    "Freeze gameplay and send the final score, elapsedMs, and optional metrics. Keep the game visible while the result is saving.",
  ],
  [
    "Receive match:completed",
    "Use the server result, not an assumed successful local score. If submission fails instead, show Retry and emit end again; the SDK preserves the original final snapshot.",
  ],
  [
    "Clean up with sdk.destroy()",
    "On page/component unmount, dispose the SDK and your own engine loops, audio, and listeners. destroy() is a method, not an event. A completed SDK instance cannot start another match; use a new launcher session.",
  ],
];

const reference = document.querySelector("#event-reference");
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function eventTable(title, description, events) {
  const section = element("section", "", "event-group");
  section.append(element("h3", title), element("p", description));
  const scroller = element("div", "", "event-table-scroll");
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute("aria-label", title);
  const table = element("table");
  const head = element("thead");
  const headers = element("tr");
  ["Event / requirement", "Payload", "When and how to use it"].forEach(
    (text) => {
      const th = element("th", text);
      th.scope = "col";
      headers.append(th);
    },
  );
  head.append(headers);
  const body = element("tbody");
  events.forEach(([name, requirement, payload, description]) => {
    const row = element("tr");
    const nameCell = element("th");
    nameCell.scope = "row";
    nameCell.append(element("code", name), element("small", requirement));
    const payloadCell = element("td");
    payloadCell.append(element("code", payload));
    row.append(nameCell, payloadCell, element("td", description));
    body.append(row);
  });
  table.append(head, body);
  scroller.append(table);
  section.append(scroller);
  reference.append(section);
}
eventTable(
  "01 · Events your game emits",
  "Call sdk.emit(eventName, payload). Omit the payload argument for events marked “No payload”.",
  emittedEvents,
);
eventTable(
  "02 · Events your game receives",
  "Register with sdk.on(eventName, handler) before game:ready. Each call returns an unsubscribe function. “Required handler” describes integration responsibilities; the SDK does not enforce listener registration.",
  receivedEvents,
);
const payloadSection = element("section", "", "event-group");
payloadSection.append(element("h3", "Payloads and delivery rules"));
const payloadCode = element("pre");
payloadCode.append(
  element(
    "code",
    `type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Progress = {
  score: number;                 // finite and nonnegative
  elapsedMs: number;             // nonnegative integer; active time only
  metrics?: Record<string, Json>;
};

sdk.emit("match:end-requested", {
  score: 120,
  elapsedMs: 45000,
  metrics: { caught: 12, heartsRemaining: 2 },
});`,
  ),
);
payloadCode.tabIndex = 0;
payloadCode.setAttribute("aria-label", "Progress payload example");
payloadSection.append(
  payloadCode,
  element(
    "p",
    "The generic backend uses Progress. Custom createGameSDK<P>() integrations may send a different JSON shape when supported by their backend. Payloads are limited to 32 KiB and 12 nesting levels. Active time excludes pauses and cannot decrease; scores may decrease. Send checkpoints, not animation frames.",
  ),
);
payloadSection.append(
  element(
    "p",
    "Progress is queued. A failed snapshot is retained and retried with the same sequence before later progress or completion. End freezes the final snapshot; do not report more progress or resume gameplay after ending. Repeated start/end calls while in flight are coalesced.",
  ),
);
payloadSection.append(
  element(
    "p",
    "sdk:error codes include TIMEOUT, PROTOCOL_MISMATCH, HTTP_<status>, and REQUEST_FAILED. A lost start response may already have consumed an attempt: close and reopen instead of automatically retrying start. For an end/result-fetch failure, keep the stopped game visible and offer Retry. Invalid retained progress needs an integration fix.",
  ),
);
payloadSection.append(
  element(
    "p",
    "The website mountCampaign() API exposes only match:completed and sdk:error through campaign.on(). The 14 events above belong to createGameSDK() inside the game. session:result-received is an internal acknowledgement sent automatically by the SDK; games do not emit it.",
  ),
);
reference.append(payloadSection);
const lifecycle = element("section", "", "event-group lifecycle");
lifecycle.id = "required-event-order";
lifecycle.append(
  element("h3", "03 · Required game events, in order"),
  element(
    "p",
    "The minimum successful round uses three outgoing requests and their three incoming confirmations. Progress is optional. Pause/resume is conditional; close is an alternative exit, not a completion step.",
  ),
);
const flow = element("div", "", "event-flow");
flow.setAttribute("aria-label", "Required event sequence");
[
  "game:ready",
  "session:initialized",
  "match:start-requested",
  "match:started",
  "match:end-requested",
  "match:completed",
].forEach((event, index) => {
  const item = element("div");
  item.append(
    element("small", index % 2 ? "RECEIVE" : "EMIT"),
    element("code", event),
  );
  flow.append(item);
});
const list = element("ol", "", "lifecycle-steps");
steps.forEach(([title, description]) => {
  const item = element("li");
  item.append(element("strong", title), element("p", description));
  list.append(item);
});
lifecycle.append(flow, list);
reference.append(lifecycle);
