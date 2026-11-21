import { Capacitor } from "@capacitor/core";
import { isBot } from "./scripts/BrowserAgents";
import { shouldShowEarlyWelcome } from "./app/startup/welcome-policy";
import { loadApplication } from "./app/startup/application-loader";
import { capturePreHydrationInput } from "./app/startup/pre-hydration-input";

/**
 * Browsers keep pinch zoom so people can enlarge text (WCAG 1.4.4). The app
 * shell feels native only without page zoom, so it locks zoom there alone.
 */
export function lockNativePageZoom(): void {
  if (!Capacitor.isNativePlatform()) return;
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !/user-scalable/.test(viewport.content)) {
    viewport.content += ", maximum-scale=1.0, user-scalable=no";
  }
}

export function startBrowserApplication(): void {
  lockNativePageZoom();
  capturePreHydrationInput();
  let earlyWelcome = false;
  try {
    earlyWelcome = shouldShowEarlyWelcome({
      pathname: location.pathname,
      acceptedVersion: localStorage.getItem("acceptedVersion"),
      native: Capacitor.isNativePlatform(), bot: isBot(), embedded: window.self !== window.top,
      notFound: !!document.querySelector("app-not-found-page"),
    });
  } catch { /* The normal app owns the fallback when storage is unavailable. */ }

  if (earlyWelcome) {
    void import("./app/startup/bootstrap-welcome")
      .then(({ bootstrapWelcome }) => bootstrapWelcome())
      .catch(() => loadApplication().then(({ bootstrap }) => bootstrap()).catch(console.error));
  } else {
    void loadApplication().then(({ bootstrap }) => bootstrap()).catch(console.error);
  }
}
