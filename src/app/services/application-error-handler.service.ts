import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import {
  ErrorHandler,
  Injectable,
  PLATFORM_ID,
  inject,
} from "@angular/core";
import { AnalyticsService } from "./analytics.service";

const dynamicImportReloadStorageKey = "pkspot.dynamic-import-reload.v1";
const dynamicImportErrorSignals = [
  "dynamically imported module",
  "failed to fetch dynamically imported module",
  "loading chunk",
  "chunkloaderror",
  "importing a module script failed",
];

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

@Injectable()
export class ApplicationErrorHandler implements ErrorHandler {
  private readonly analytics = inject(AnalyticsService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  handleError(error: unknown): void {
    this.analytics.reportError(error, {
      context: "angular_global_error_handler",
      feature: "app",
      action: "uncaught_error",
      severity: "fatal",
      handled: false,
      userFacing: true,
    });

    if (isDynamicImportLoadError(error)) {
      this.reloadOnceForDynamicImportError();
    }

    console.error(error);
  }

  private reloadOnceForDynamicImportError(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const view = this.document.defaultView;
    if (!view) {
      return;
    }

    try {
      if (view.sessionStorage.getItem(dynamicImportReloadStorageKey)) {
        return;
      }

      view.sessionStorage.setItem(dynamicImportReloadStorageKey, "1");
      view.setTimeout(() => view.location.reload(), 0);
    } catch (error) {
      console.warn("Failed to schedule stale app reload", error);
    }
  }
}
