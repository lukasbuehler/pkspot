import { UserSettingsSchema } from "./UserSchema";
import {
  NotificationPreferencesSchema,
  NotificationPromptStateSchema,
} from "./NotificationSchema";

/**
 * Private user data stored in users/{userId}/private_data/main
 * This document is only accessible by the authenticated user themselves.
 */
export interface PrivateUserDataSchema {
  bookmarks?: string[]; // Array of Spot IDs the user has saved
  visited_spots?: string[]; // Array of Spot IDs the user has checked into
  going_events?: string[]; // Private index of events where the user is going/registered
  saved_events?: string[]; // Private index of events the user marked interested
  settings?: UserSettingsSchema; // User preferences (maps app, etc.)
  notification_preferences?: NotificationPreferencesSchema;
  notification_prompt_state?: NotificationPromptStateSchema;
  /** IANA time zone used for local notification delivery schedules. */
  time_zone?: string;
}
