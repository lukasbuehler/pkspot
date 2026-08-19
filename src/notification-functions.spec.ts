import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  clampFcmTtlMs,
  firstSpotIdPayload,
} from "../functions/src/notificationFunctions";

describe("notification functions", () => {
  it("clamps FCM transport TTLs independently from intent retention", () => {
    const now = Date.parse("2026-08-03T12:00:00Z");
    const dayMs = 24 * 60 * 60 * 1000;

    expect(clampFcmTtlMs(now - dayMs, now)).toBe(0);
    expect(clampFcmTtlMs(now + dayMs, now)).toBe(dayMs);
    expect(clampFcmTtlMs(now + 90 * dayMs, now)).toBe(28 * dayMs);
  });

  it("bounds legacy digest Spot IDs to one FCM payload item", () => {
    const fullList = Array.from({ length: 500 }, (_, index) => `spot-${index}`);

    expect(firstSpotIdPayload(JSON.stringify(fullList))).toBe('["spot-0"]');
    expect(firstSpotIdPayload("not-json")).toBeUndefined();
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
    expect(source.indexOf("await syncNotificationFeedProjection(snapshot.id"))
      .toBeLessThan(source.indexOf("await processIntent(snapshot.ref)"));
    expect(source).toContain("await processIntent(snapshot.ref)");
    expect(source).toContain('{ schedule: "every 1 minutes", timeZone: "UTC" }');
    expect(index).toContain("onImmediateNotificationIntentCreate");
  });

  it("projects duplicate resolutions as reporter-visible outcomes", () => {
    const notifications = readFileSync(
      resolve("functions/src/notificationFunctions.ts"),
      "utf8",
    );
    const safetyCases = readFileSync(
      resolve("functions/src/safetyCaseProjectionFunctions.ts"),
      "utf8",
    );

    expect(notifications).toContain('value === "resolve_duplicate_spot"');
    expect(safetyCases).toContain(
      'actionType === "delete_spot" || actionType === "resolve_duplicate_spot"',
    );
  });

  it("delivers notification navigation data needed by every click surface", () => {
    const deliverySource = readFileSync(
      resolve("functions/src/notificationFunctions.ts"),
      "utf8",
    );
    const digestSource = readFileSync(
      resolve("functions/src/communityNotificationFunctions.ts"),
      "utf8",
    );
    const serviceWorkerSource = readFileSync(
      resolve("src/firebase-messaging-sw.js"),
      "utf8",
    );

    expect(digestSource).toContain("path: topSpotPath");
    expect(digestSource).toContain("top_spot_path: topSpotPath");
    expect(deliverySource).toContain('intent.payload["top_spot_path"]');
    expect(deliverySource).toContain(
      'firstSpotIdPayload(intent.payload["spot_ids"])',
    );
    expect(deliverySource).toContain(
      '...(fcmSpotIds ? { spot_ids: fcmSpotIds } : {})',
    );
    expect(serviceWorkerSource).toContain("notificationPath(data)");
    expect(serviceWorkerSource).toContain('data.type !== "community_spot_digest"');
  });

  it("keeps service-worker notification paths on the app origin", () => {
    const source = readFileSync(resolve("src/firebase-messaging-sw.js"), "utf8");
    const context: Record<string, unknown> = {
      URL,
      URLSearchParams,
      importScripts: () => undefined,
      firebase: {
        initializeApp: () => undefined,
        messaging: () => ({ onBackgroundMessage: () => undefined }),
      },
      self: {
        location: { origin: "https://pkspot.app" },
        addEventListener: () => undefined,
      },
    };
    runInNewContext(source, context);
    const safeOptionalPath = context["safeOptionalPath"] as (
      value: unknown,
    ) => string | null;

    expect(safeOptionalPath("/map/spots/test?tab=media#photo")).toBe(
      "/map/spots/test?tab=media#photo",
    );
    expect(safeOptionalPath("/\\attacker.example")).toBeNull();
    expect(safeOptionalPath("//attacker.example")).toBeNull();
  });
});
