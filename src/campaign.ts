import { Emitter, type Result, type SDKError } from "./protocol.js";

export interface MountOptions {
  campaignId: string;
  target?: string | HTMLElement;
  presentation?: "modal" | "inline";
  environment?: "production" | "local";
  launcherUrl?: string;
  apiOrigin?: string;
  gameOrigin?: string;
  source?: string;
  orderCode?: string;
}
interface Launcher {
  init(options: Record<string, unknown>): Promise<void>;
  destroy(): void;
}
let mounted = false;
let scriptPromise: Promise<Launcher> | undefined;
let loadedUrl: string | undefined;
function loadLauncher(url: string): Promise<Launcher> {
  if (loadedUrl && loadedUrl !== url)
    throw new Error(
      "A different launcher build is already loaded; reload the page",
    );
  if (!scriptPromise) {
    loadedUrl = url;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error("Launcher loading timed out"));
      }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        const launcher = (window as unknown as { GameLauncher?: Launcher })
          .GameLauncher;
        if (!launcher?.destroy)
          reject(new Error("Launcher does not support SDK v1"));
        else resolve(launcher);
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("Could not load launcher"));
      };
      document.head.appendChild(script);
    });
    scriptPromise.catch(() => {
      scriptPromise = undefined;
      loadedUrl = undefined;
    });
  }
  return scriptPromise;
}

export async function mountCampaign(options: MountOptions) {
  if (mounted)
    throw new Error("Destroy the current campaign before mounting another");
  if (options.presentation === "inline" && !options.target)
    throw new Error("Inline presentation requires a target");
  if (
    options.environment === "local" &&
    (!options.launcherUrl || !options.apiOrigin || !options.gameOrigin)
  ) {
    throw new Error(
      "Local mode requires launcherUrl, apiOrigin and gameOrigin",
    );
  }
  mounted = true;
  const events = new Emitter<{
    "match:completed": Result;
    "sdk:error": SDKError;
  }>();
  const url = new URL(
    options.launcherUrl ?? "https://cdn.thegamescore.com/GameLauncher.min.js",
    location.href,
  ).href;
  try {
    const launcher = await loadLauncher(url);
    await launcher.init({
      gameId: options.campaignId,
      elem: options.target,
      modal: options.presentation !== "inline",
      autorun: true,
      apiOrigin: options.apiOrigin,
      gameOrigin: options.gameOrigin,
      source: options.source,
      orderCode: options.orderCode,
      onSDKEvent: (type: "match:completed" | "sdk:error", payload: any) =>
        events.emit(type, payload),
    });
    let destroyed = false;
    return {
      on: events.on.bind(events),
      destroy() {
        if (!destroyed) {
          destroyed = true;
          launcher.destroy();
          mounted = false;
          events.clear();
        }
      },
    };
  } catch (error) {
    mounted = false;
    throw error;
  }
}
