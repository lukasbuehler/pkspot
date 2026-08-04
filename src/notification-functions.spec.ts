import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("immediately claims newly-created due intents and retains scheduled recovery", () => {
    const source = readFileSync(
      resolve("functions/src/notificationFunctions.ts"),
      "utf8",
    );
    const index = readFileSync(resolve("functions/src/index.ts"), "utf8");

    expect(source).toContain("export const onImmediateNotificationIntentCreate");
    expect(source).toContain('onDocumentCreated(\n  "notification_intents/{intentId}"');
    expect(source).toContain("sendAfter.toMillis() > Date.now()");
    expect(source).toContain("await processIntent(snapshot.ref)");
    expect(source).toContain('{ schedule: "every 1 minutes", timeZone: "UTC" }');
    expect(index).toContain("onImmediateNotificationIntentCreate");
  });
});
