import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(path), "utf8");

const notificationIconSizes = [
  ["ldpi", 18],
  ["mdpi", 24],
  ["hdpi", 36],
  ["xhdpi", 48],
  ["xxhdpi", 72],
  ["xxxhdpi", 96],
] as const;

describe("Android notification configuration", () => {
  it("creates semantic channels before a background FCM delivery", () => {
    const manifest = readSource("android/app/src/main/AndroidManifest.xml");
    const application = readSource(
      "android/app/src/main/java/com/pkspot/app/PKSpotApplication.java",
    );
    const channels = readSource(
      "android/app/src/main/java/com/pkspot/app/NotificationChannels.java",
    );

    expect(manifest).toContain('android:name=".PKSpotApplication"');
    expect(application).toContain("NotificationChannels.configure(this)");
    expect(channels).toContain('"follow_incoming"');
    expect(channels).toContain('"follow_relationships"');
    expect(channels).toContain('"community_events"');
    expect(channels).toContain('"community_spot_digest"');
    expect(channels).toContain('"fcm_fallback_notification_channel"');
  });

  it("uses the density-specific monochrome PK Spot icon", () => {
    const manifest = readSource("android/app/src/main/AndroidManifest.xml");

    expect(manifest).toContain(
      'android:resource="@drawable/ic_stat_pkspot"',
    );

    for (const [density, expectedSize] of notificationIconSizes) {
      const icon = readFileSync(
        resolve(
          `android/app/src/main/res/drawable-${density}/ic_stat_pkspot.png`,
        ),
      );

      expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(icon.readUInt32BE(16)).toBe(expectedSize);
      expect(icon.readUInt32BE(20)).toBe(expectedSize);
    }
  });
});
