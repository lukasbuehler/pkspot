import { DOCUMENT, isPlatformBrowser, LocationStrategy } from "@angular/common";
import {
  ErrorHandler,
  Injectable,
  Injector,
  PLATFORM_ID,
  inject,
} from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { NavigationError } from "@angular/router";
import { AnalyticsService } from "./analytics.service";

const dynamicImportReloadStorageKey = "pkspot.dynamic-import-reload.v1";
const dynamicImportErrorSignals = [
  "dynamically imported module",
  "failed to fetch dynamically imported module",
  "loading chunk",
  "chunkloaderror",
  "importing a module script failed",
];
const angularHmrErrorSignals = ["ɵhmr"];

function collectErrorSignals(error: unknown, depth: number = 0): string[] {
  if (depth > 2 || error === null || error === undefined) {
    return [];
  }

  if (typeof error === "string") {
    return [error];
  }

  if (error instanceof Error) {
    return [error.name, error.message];
  }

  if (typeof error !== "object") {
    return [String(error)];
  }

  const record = error as Record<string, unknown>;
  const values = ["name", "message", "reason"]
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string");

  return [
    ...values,
    ...collectErrorSignals(record["error"], depth + 1),
    ...collectErrorSignals(record["rejection"], depth + 1),
  ];
}

export function isDynamicImportLoadError(error: unknown): boolean {
  const signalText = collectErrorSignals(error).join("\n").toLowerCase();
  return dynamicImportErrorSignals.some((signal) => signalText.includes(signal));
}

export function isAngularHmrModuleError(error: unknown): boolean {
  const signalText = collectErrorSignals(error).join("\n").toLowerCase();
  return angularHmrErrorSignals.some((signal) => signalText.includes(signal));
}

/** The page a navigation was opening when its code failed to load. */
@Injectable({ providedIn: "root" })
export class FailedNavigationTarget {
  url: string | null = null;
}

/**
 * Router navigation error handler. Remembers where a navigation was going
 * when its page code failed to load, so recovery can open that page.
 */
export function rememberFailedNavigationTarget(error: NavigationError): void {
  if (!isDynamicImportLoadError(error.error)) return;
  inject(FailedNavigationTarget).url = inject(LocationStrategy).prepareExternalUrl(error.url);
}

@Injectable()
export class ApplicationErrorHandler implements ErrorHandler {
  private readonly analytics = inject(AnalyticsService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    this.analytics.reportError(error, {
      context: "angular_global_error_handler",
      feature: "app",
      action: "uncaught_error",
      severity: "fatal",
      handled: false,
      userFacing: true,
    });

    if (isDynamicImportLoadError(error) || isAngularHmrModuleError(error)) {
      this.reloadOnceForRecoverableModuleError();
    }

    // Error properties are non-enumerable, so Capacitor's console bridge can
    // reduce them to {}. Send readable text while retaining the original above.
    // WebKit stacks can contain only frames, without the error name/message.
    const description = error instanceof Error
      ? `${error.name}: ${error.message}`
      : collectErrorSignals(error).join("\n") || String(error);
    console.error("[AppError]", error instanceof Error && error.stack
      ? error.stack.includes(description) ? error.stack : `${description}\n${error.stack}`
      : description);
  }

  private reloadOnceForRecoverableModuleError(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const view = this.document.defaultView;
    if (!view) {
      return;
    }

    // Without a connection the page part cannot load and a reload would only
    // replace the app with the browser's offline page. Stay on the current
    // page, say why, and open the page once the connection is back.
    const failedNavigation = this.injector.get(FailedNavigationTarget);
    const target = failedNavigation.url;
    failedNavigation.url = null;

    if (view.navigator?.onLine === false) {
      this.showOfflineNotice(target ? offlinePageName(target) : null);
      if (target) this.openWhenBackOnline(view, target);
      return;
    }

    // Browsers remember a failed module download, so the page code cannot be
    // loaded again without a fresh page load. Open the page the person was
    // heading to (e.g. after reconnecting), or reload the current one.
    const attempt = target ?? view.location.href;
    try {
      if (view.sessionStorage.getItem(dynamicImportReloadStorageKey) === attempt) {
        return;
      }

      view.sessionStorage.setItem(dynamicImportReloadStorageKey, attempt);
      console.warn("[AppError] Loading the page again to recover from a module-load error");
      view.setTimeout(() => {
        if (target) view.location.assign(target);
        else view.location.reload();
      }, 0);
    } catch (error) {
      console.warn("Failed to schedule stale app reload", error);
    }
  }

  /** The page to open on reconnecting; only the latest tap counts. */
  private pendingOnlineTarget: string | null = null;

  /**
   * Keeps the offline notice's promise: once the browser is online again,
   * open the page the person tapped, unless they have moved on since.
   */
  private openWhenBackOnline(view: Window, target: string): void {
    const waiting = this.pendingOnlineTarget !== null;
    this.pendingOnlineTarget = target;
    if (waiting) return;

    const startedOn = view.location.href;
    // Tapping another link (even the current page's) means the person has
    // chosen somewhere else to go; drop the pending page.
    const cancelOnLinkTap = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.("a[href]")) this.pendingOnlineTarget = null;
    };
    view.document?.addEventListener("click", cancelOnLinkTap, true);
    view.addEventListener(
      "online",
      () => {
        view.document?.removeEventListener("click", cancelOnLinkTap, true);
        const pending = this.pendingOnlineTarget;
        this.pendingOnlineTarget = null;
        if (pending && view.location.href === startedOn) {
          view.location.assign(pending);
        }
      },
      { once: true },
    );
  }

  private showOfflineNotice(pageName: string | null): void {
    try {
      this.injector.get(MatSnackBar).open(
        pageName
          ? $localize`:@@app.offline.named_page_unavailable:You're offline. ${pageName}:PAGE: opens once you're connected again.`
          : $localize`:@@app.offline.page_unavailable:You're offline. The page you chose opens once you're connected again.`,
        $localize`:@@app.offline.page_unavailable.dismiss:OK`,
        { duration: 8000 },
      );
    } catch (error) {
      console.warn("Failed to show the offline notice", error);
    }
  }
}

/**
 * The navigation name of a top-level page, so the offline notice can say
 * which page will open. Null for other pages; the notice then stays generic.
 */
export function offlinePageName(url: string): string | null {
  let path: string;
  try {
    path = new URL(url, "https://pkspot.app").pathname;
  } catch {
    return null;
  }
  const segments = path.split("/").filter(Boolean);
  // Localized builds prefix the path with the locale, e.g. /de/events.
  if (segments[0] && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(segments[0]) && segments.length > 1) {
    segments.shift();
  }
  switch (segments[0]) {
    case "map":
      return $localize`:Map navbar button label|A very short label for the navbar map label@@map_label:Map`;
    case "events":
      return $localize`:Events navbar button label|A very short label for the navbar events page button@@events_label:Events`;
    case "train":
      return $localize`:Train navbar button label|A very short label for training planning@@train.nav:Train`;
    case "notifications":
      return $localize`:@@navigation.notifications:Notifications`;
    case "about":
      return $localize`:About page navbar button label|A very short label for the navbar about page button@@about_page_label:About`;
    default:
      return null;
  }
}
