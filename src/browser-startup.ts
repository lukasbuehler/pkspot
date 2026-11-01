import { Capacitor } from "@capacitor/core";
import { isBot } from "./scripts/BrowserAgents";
import { shouldShowEarlyWelcome } from "./app/startup/welcome-policy";
import { loadApplication } from "./app/startup/application-loader";
import { capturePreHydrationInput } from "./app/startup/pre-hydration-input";

export function startBrowserApplication(): void {
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
