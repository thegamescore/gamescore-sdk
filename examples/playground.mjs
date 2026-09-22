import { mountCampaign } from "/dist/host.js";
import { ids } from "/examples/campaigns.mjs";

const names = {
  glow: "Glow Beauty",
  sprint: "Sprint Club",
  neutral: "GamesCore",
};
const brandInputs = [...document.querySelectorAll('[name="brand"]')];
const presentationInputs = [
  ...document.querySelectorAll('[name="presentation"]'),
];
const launch = document.querySelector("#launch");
const close = document.querySelector("#destroy");
const status = document.querySelector("#status");
const container = document.querySelector("#game-container");
const summary = document.querySelector("#selection-summary");
const code = document.querySelector("#integration-code");
const copyCode = document.querySelector("#copy-code");
const copyId = document.querySelector("#copy-id");
const copyStatus = document.querySelector("#copy-status");
let codeFormat = "html";
let campaign;
let loading = false;
const selectedBrand = () => brandInputs.find((input) => input.checked)?.value;
const selectedView = () =>
  presentationInputs.find((input) => input.checked)?.value;

function message(text, error = false) {
  status.textContent = text;
  status.dataset.error = String(error);
}
function render() {
  const brand = selectedBrand();
  launch.disabled = !brand || !selectedView() || loading || !!campaign;
  close.disabled = !campaign || loading;
  [...brandInputs, ...presentationInputs].forEach((input) => {
    input.disabled = loading || !!campaign;
  });
  launch.innerHTML = loading
    ? "Opening campaign…"
    : campaign
      ? "Campaign is open"
      : 'Launch campaign <span aria-hidden="true">↗</span>';
  launch.setAttribute("aria-busy", String(loading));
  summary.textContent = brand
    ? `${names[brand]} · ${selectedView() === "inline" ? "Inline game" : "Modal view"}`
    : "Choose a brand to get started";
  renderIntegration();
}

function renderIntegration() {
  const brand = selectedBrand();
  const inline = selectedView() === "inline";
  copyCode.disabled = !brand;
  copyId.disabled = !brand;
  copyStatus.textContent = "";
  document.querySelectorAll("[data-code]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.code === codeFormat),
    );
  });
  document.querySelector("#code-context").textContent = brand
    ? `${names[brand]} / ${inline ? "inline" : "modal"} / ${codeFormat === "html" ? "embed.html" : "campaign.js"}`
    : "No campaign selected";
  if (!brand) {
    code.textContent = "Select a brand above to see its integration code.";
    document.querySelector("#integration-note").textContent =
      "Choose a brand to prepare your integration.";
    return;
  }
  const markup = inline
    ? '<div id="game-container" style="height: 680px"></div>\n\n'
    : "";
  code.textContent =
    codeFormat === "html"
      ? `${markup}<!-- Replace these example URLs with your deployed services. -->
<script src="https://your-cdn.example/GameLauncher.min.js"></script>
<script>
  GameLauncher.init({
    gameId: "${ids[brand]}",
    modal: ${!inline},${inline ? '\n    elem: "#game-container",' : ""}
    autorun: true,
    apiOrigin: "https://your-api.example",
    gameOrigin: "https://your-games.example",
  }).catch(console.error);
</script>`
      : `${inline ? '// Add to your HTML: <div id="game-container" style="height: 680px"></div>\n\n' : ""}import { mountCampaign } from "@gamescore/sdk/host";

const campaign = await mountCampaign({
  campaignId: "${ids[brand]}",${inline ? '\n  target: "#game-container",' : ""}
  presentation: "${selectedView()}",
  launcherUrl: "https://your-cdn.example/GameLauncher.min.js",
  apiOrigin: "https://your-api.example",
  gameOrigin: "https://your-games.example",
});

campaign.on("match:completed", (result) => {
  console.log("Score:", result.score);
});

// Call campaign.destroy() when your page or component unmounts.`;
  document.querySelector("#integration-note").textContent =
    "Replace the example URLs with your deployed launcher, API, and game services. This campaign ID belongs to the local demo; use your live campaign ID for production." +
    (codeFormat === "sdk"
      ? " The SDK is not published yet: install from a local checkout with npm install ../game-sdk, or install its npm pack archive. Use this code in a JavaScript module."
      : " Paste this snippet into your page where the campaign should appear. Use the SDK-compatible launcher build.");
}

async function copyText(text, success) {
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = success;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent =
      "Clipboard unavailable. Select and copy the code above manually.";
    code.parentElement.focus();
  }
}
document.querySelectorAll("[data-code]").forEach((button) =>
  button.addEventListener("click", () => {
    codeFormat = button.dataset.code;
    renderIntegration();
  }),
);
copyCode.addEventListener("click", () => {
  if (!copyCode.disabled)
    copyText(code.textContent, "Integration code copied.");
});
copyId.addEventListener("click", () => {
  if (!copyId.disabled) copyText(ids[selectedBrand()], "Campaign ID copied.");
});
const initialBrand = new URLSearchParams(location.search).get("brand");
brandInputs.forEach((input) => {
  input.checked = input.value === initialBrand;
  input.addEventListener("change", () => {
    const url = new URL(location.href);
    url.searchParams.set("brand", selectedBrand());
    history.replaceState(null, "", url);
    message("Ready when you are. Launch your selected campaign.");
    render();
  });
});
presentationInputs.forEach((input) =>
  input.addEventListener("change", () => {
    message(
      selectedBrand()
        ? "Ready when you are. Launch your selected campaign."
        : "Select a campaign above to enable launch.",
    );
    render();
  }),
);
launch.addEventListener("click", async () => {
  if (launch.disabled) return;
  loading = true;
  container.hidden = selectedView() !== "inline";
  message("Opening your campaign…");
  render();
  try {
    const response = await fetch("/runtime.json");
    if (!response.ok)
      throw new Error("Could not load campaign settings. Please try again.");
    const runtime = await response.json();
    campaign = await mountCampaign({
      campaignId: ids[selectedBrand()],
      target: "#game-container",
      presentation: selectedView(),
      environment: "local",
      launcherUrl: "/examples/vendor/launcher/GameLauncher.min.js",
      apiOrigin: runtime.hostOrigin,
      gameOrigin: runtime.gameOrigin,
    });
    campaign.on("match:completed", (result) =>
      message(`Saved demo result: ${result.score} points.`),
    );
    campaign.on("sdk:error", (error) => message(error.message, true));
    message("Campaign active. Close it to change your selection.");
    if (selectedView() === "inline")
      container.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  } catch (error) {
    container.hidden = true;
    message(
      error.message || "Could not open the campaign. Please try again.",
      true,
    );
  } finally {
    loading = false;
    render();
  }
});
close.addEventListener("click", () => {
  if (close.disabled) return;
  campaign.destroy();
  campaign = undefined;
  container.hidden = true;
  message("Campaign closed. Choose another brand or play again.");
  render();
  launch.focus();
});
if (selectedBrand())
  message("Ready when you are. Launch your selected campaign.");
render();
