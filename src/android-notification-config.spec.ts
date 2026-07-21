import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string): string =>
  readFileSync(resolve(path), "utf8");

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
    expect(channels).toContain('"fcm_fallback_notification_channel"');
  });

  it("uses the full-canvas monochrome status-bar icon", () => {
    const manifest = readSource("android/app/src/main/AndroidManifest.xml");
    const icon = readSource(
      "android/app/src/main/res/drawable/ic_stat_pkspot_full.xml",
    );

    expect(manifest).toContain(
      'android:resource="@drawable/ic_stat_pkspot_full"',
    );
    expect(icon).toContain('android:width="24dp"');
    expect(icon).toContain('android:height="24dp"');
    expect(icon).toContain('android:fillType="evenOdd"');
  });
});
