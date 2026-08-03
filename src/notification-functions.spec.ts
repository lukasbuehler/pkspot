import { describe, expect, it } from "vitest";
import { clampFcmTtlMs } from "../functions/src/notificationFunctions";

describe("notification functions", () => {
  it("clamps FCM transport TTLs independently from intent retention", () => {
    const now = Date.parse("2026-08-03T12:00:00Z");
    const dayMs = 24 * 60 * 60 * 1000;

    expect(clampFcmTtlMs(now - dayMs, now)).toBe(0);
    expect(clampFcmTtlMs(now + dayMs, now)).toBe(dayMs);
    expect(clampFcmTtlMs(now + 90 * dayMs, now)).toBe(28 * dayMs);
  });
});
