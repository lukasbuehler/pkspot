import { describe, expect, it } from "vitest";
import { buildNotificationDeliveryDiagnostics } from "../functions/src/notificationDeliveryDiagnostics";

describe("notification delivery diagnostics", () => {
  it("records per-platform and per-registration FCM acceptance without tokens", () => {
    const diagnostics = buildNotificationDeliveryDiagnostics([
      {
        registrationId: "android-registration",
        platform: "android",
        appVersion: "1.1.4",
        locale: "de-CH",
        accepted: true,
        messageId: "projects/p/messages/android-message",
      },
      {
        registrationId: "web-registration",
        platform: "web",
        appVersion: "1.1.4",
        locale: "en",
        accepted: false,
        errorCode: "messaging/registration-token-not-registered",
      },
    ], 2, 123_456);

    expect(diagnostics).toEqual(expect.objectContaining({
      attempt: 2,
      attempted_at_raw_ms: 123_456,
      attempted_count: 2,
      accepted_count: 1,
      failed_count: 1,
      platforms: {
        android: { attempted_count: 1, accepted_count: 1, failed_count: 0 },
        web: { attempted_count: 1, accepted_count: 0, failed_count: 1 },
      },
    }));
    expect(diagnostics.registrations).toEqual([
      expect.objectContaining({
        registration_id: "android-registration",
        accepted: true,
        message_id: "projects/p/messages/android-message",
      }),
      expect.objectContaining({
        registration_id: "web-registration",
        accepted: false,
        error_code: "messaging/registration-token-not-registered",
      }),
    ]);
    expect(
      diagnostics.registrations.every((registration) => !("token" in registration)),
    ).toBe(true);
  });
});
