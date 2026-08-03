import type {
  NotificationDeliveryDiagnosticsSchema,
  NotificationPlatform,
  NotificationRegistrationDeliveryDiagnosticSchema,
} from "../../src/db/schemas/NotificationSchema";

export interface NotificationDeliveryResultInput {
  registrationId: string;
  platform: NotificationPlatform;
  appVersion: string;
  locale: string;
  accepted: boolean;
  messageId?: string;
  errorCode?: string;
}

export function buildNotificationDeliveryDiagnostics(
  results: readonly NotificationDeliveryResultInput[],
  attempt: number,
  attemptedAtRawMs: number,
): NotificationDeliveryDiagnosticsSchema {
  const registrations: NotificationRegistrationDeliveryDiagnosticSchema[] =
    results.map((result) => ({
      registration_id: result.registrationId,
      platform: result.platform,
      app_version: result.appVersion,
      locale: result.locale,
      accepted: result.accepted,
      ...(result.messageId ? { message_id: result.messageId } : {}),
      ...(result.errorCode ? { error_code: result.errorCode } : {}),
    }));
  const platforms: NotificationDeliveryDiagnosticsSchema["platforms"] = {};
  for (const result of registrations) {
    const current = platforms[result.platform] ?? {
      attempted_count: 0,
      accepted_count: 0,
      failed_count: 0,
    };
    platforms[result.platform] = {
      attempted_count: current.attempted_count + 1,
      accepted_count: current.accepted_count + (result.accepted ? 1 : 0),
      failed_count: current.failed_count + (result.accepted ? 0 : 1),
    };
  }
  const acceptedCount = registrations.filter(({ accepted }) => accepted).length;
  return {
    attempt,
    attempted_at_raw_ms: attemptedAtRawMs,
    attempted_count: registrations.length,
    accepted_count: acceptedCount,
    failed_count: registrations.length - acceptedCount,
    platforms,
    registrations,
  };
}
