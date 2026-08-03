import type { AuthType } from "firebase-functions/v2/firestore";

export type EventNotificationChange =
  | "cancelled"
  | "restored"
  | "time"
  | "location";

export function shouldPublishAutomaticReschedule(
  change: EventNotificationChange | null,
  structuredOperation: boolean,
  authType: AuthType,
): boolean {
  return change === "time" &&
    !structuredOperation &&
    authType !== "service_account" &&
    authType !== "system";
}
