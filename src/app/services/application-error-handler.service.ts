import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import {
  ErrorHandler,
  Injectable,
  Injector,
  PLATFORM_ID,
  inject,
} from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
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
    // page and say why instead; the next tap after reconnecting loads it.
    if (view.navigator?.onLine === false) {
      this.showOfflineNotice();
      return;
    }

    try {
      if (view.sessionStorage.getItem(dynamicImportReloadStorageKey)) {
        return;
      }

      view.sessionStorage.setItem(dynamicImportReloadStorageKey, "1");
      console.warn("[AppError] Reloading once to recover from a module-load error");
      view.setTimeout(() => view.location.reload(), 0);
    } catch (error) {
      console.warn("Failed to schedule stale app reload", error);
    }
  }

  private showOfflineNotice(): void {
    try {
      this.injector.get(MatSnackBar).open(
        $localize`:@@app.offline.page_unavailable:You're offline. This page opens once you're connected again.`,
        $localize`:@@app.offline.page_unavailable.dismiss:OK`,
        { duration: 8000 },
      );
    } catch (error) {
      console.warn("Failed to show the offline notice", error);
    }
  }
}
