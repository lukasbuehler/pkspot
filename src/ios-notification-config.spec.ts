import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("iOS notification configuration", () => {
  it("removes delivered notifications after a native action", () => {
    const plugin = readFileSync(
      resolve("ios/App/App/NotificationSettingsPlugin.swift"),
      "utf8",
    );
    const service = readFileSync(
      resolve("src/app/services/push-notifications.service.ts"),
      "utf8",
    );

    expect(plugin).toContain('CAPPluginMethod(name: "dismissDeliveredNotification"');
    expect(plugin).toContain("getDeliveredNotifications");
    expect(plugin).toContain("removeDeliveredNotifications(withIdentifiers:");
    expect(service).toContain("NotificationSettings.dismissDeliveredNotification");
  });
});
