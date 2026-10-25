import { Injectable, Injector, inject } from "@angular/core";
import { AnalyticsService } from "./analytics.service";

const SAFE_ERROR_CODES = new Set([
  "permission-denied", "unauthenticated", "unavailable", "deadline-exceeded",
  "failed-precondition", "not-found", "already-exists", "resource-exhausted",
  "invalid-argument", "cancelled", "canceled", "aborted", "internal", "unknown",
  "unauthorized", "retry-limit-exceeded", "quota-exceeded", "network-request-failed",
]);

export function telemetryErrorCode(error: unknown): string {
  const raw = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const code = typeof raw === "string" ? raw.split("/").at(-1)! : "unknown";
  return SAFE_ERROR_CODES.has(code) ? code : "unknown";
}

/** Only static feature/action names and allowlisted error codes cross this boundary.
 * Never pass document paths, payloads, coordinates, age results or free-form errors.
 */
@Injectable({ providedIn: "root" })
export class FeatureTelemetryService {
  private readonly injector = inject(Injector);
  private get analytics(): AnalyticsService { return this.injector.get(AnalyticsService); }
  private readonly reported = new WeakSet<object>();

  async run<T>(feature: string, action: string, operation: () => Promise<T>, outcomes = true): Promise<T> {
    if (outcomes) this.event("feature_action_started", feature, action);
    try {
      const result = await operation();
      if (outcomes) this.event("feature_action_succeeded", feature, action);
      return result;
    } catch (error) {
      if (outcomes) this.event("feature_action_failed", feature, action, telemetryErrorCode(error));
      this.failure(feature, action, error);
      throw error;
    }
  }

  outcome(feature: string, action: string, succeeded: boolean): void {
    this.event(succeeded ? "feature_action_succeeded" : "feature_action_failed", feature, action);
  }

  failure(feature: string, action: string, error: unknown): void {
    if (error && typeof error === "object") {
      if (this.reported.has(error)) return;
      this.reported.add(error);
    }
    const code = telemetryErrorCode(error);
    try {
      this.analytics.trackEvent("operation_failed", { feature, action, error_code: code });
      this.analytics.reportError(new Error(`${feature}.${action} failed (${code})`), {
        context: `${feature}.${action}`, feature, action, handled: true,
        properties: { error_code: code },
      });
    } catch { /* Telemetry must never change the operation's result. */ }
  }

  private event(name: string, feature: string, action: string, errorCode?: string): void {
    try {
      this.analytics.trackEvent(name, {
        feature, action, ...(errorCode ? { error_code: errorCode } : {}),
      });
    } catch { /* Analytics is optional. */ }
  }
}
