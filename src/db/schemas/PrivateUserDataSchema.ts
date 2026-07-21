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
  settings?: UserSettingsSchema; // User preferences (maps app, etc.)
  notification_preferences?: NotificationPreferencesSchema;
  notification_prompt_state?: NotificationPromptStateSchema;
}
