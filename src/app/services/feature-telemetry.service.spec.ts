import { TestBed } from "@angular/core/testing";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnalyticsService } from "./analytics.service";
import { FeatureTelemetryService, telemetryErrorCode } from "./feature-telemetry.service";

describe("feature telemetry", () => {
  const trackEvent = vi.fn(), reportError = vi.fn();
  let service: FeatureTelemetryService;
  beforeEach(() => {
    trackEvent.mockReset(); reportError.mockReset();
    TestBed.configureTestingModule({ providers: [{ provide: AnalyticsService, useValue: { trackEvent, reportError } }] });
    service = TestBed.inject(FeatureTelemetryService);
  });
  it("records success only after persistence finishes and returns the original result", async () => {
    let finish!: (value: string) => void;
    const task = service.run("activity_log", "create", () => new Promise<string>(resolve => finish = resolve));
    expect(trackEvent.mock.calls.map(c => c[0])).toEqual(["feature_action_started"]);
    finish("private-id"); expect(await task).toBe("private-id");
    expect(trackEvent.mock.calls.map(c => c[0])).toEqual(["feature_action_started", "feature_action_succeeded"]);
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("private-id");
  });
  it("reports handled failures once across nested adapters without exposing their message", async () => {
    const error = Object.assign(new Error("private photo location and token"), { code: "functions/permission-denied" });
    await expect(service.run("activity_log", "create", () => service.run("firestore", "add", async () => { throw error; }, false))).rejects.toBe(error);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(trackEvent.mock.calls.filter(c => c[0] === "operation_failed")).toHaveLength(1);
    expect(trackEvent.mock.calls.some(c => c[0] === "feature_action_failed")).toBe(true);
    expect(reportError.mock.calls[0][0].message).not.toContain("private");
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("private");
  });
  it("does not let analytics failures change application success or failure", async () => {
    trackEvent.mockImplementation(() => { throw new Error("analytics offline"); });
    expect(await service.run("test", "save", async () => 42)).toBe(42);
    const error = new Error("original");
    await expect(service.run("test", "save", async () => { throw error; })).rejects.toBe(error);
  });
  it("allowlists codes rather than reporting arbitrary server text", () => {
    expect(telemetryErrorCode({ code: "storage/unauthorized" })).toBe("unauthorized");
    expect(telemetryErrorCode({ code: "user@example.com" })).toBe("unknown");
  });
});
