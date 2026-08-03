import { describe, expect, it } from "vitest";
import { shouldPublishAutomaticReschedule } from "../functions/src/eventNotificationSourcePolicy";

describe("event notification source policy", () => {
  it("does not publish reschedules for backend normalization writes", () => {
    expect(shouldPublishAutomaticReschedule("time", false, "service_account")).toBe(false);
    expect(shouldPublishAutomaticReschedule("time", false, "system")).toBe(false);
  });

  it("keeps automatic reschedules for direct client edits", () => {
    expect(shouldPublishAutomaticReschedule("time", false, "api_key")).toBe(true);
    expect(shouldPublishAutomaticReschedule("time", false, "unknown")).toBe(true);
  });

  it("leaves structured operations and unrelated edits to their own paths", () => {
    expect(shouldPublishAutomaticReschedule("time", true, "api_key")).toBe(false);
    expect(shouldPublishAutomaticReschedule("location", false, "api_key")).toBe(false);
    expect(shouldPublishAutomaticReschedule(null, false, "api_key")).toBe(false);
  });
});
