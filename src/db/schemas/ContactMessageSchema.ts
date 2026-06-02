export type ContactMessageTopic = "general" | "spot-import" | "crew";

export interface ContactMessageUserSchema {
  uid: string;
  email?: string;
  display_name?: string;
}

export interface ContactMessageAnalyticsSchema {
  posthog_distinct_id?: string;
  posthog_session_id?: string;
  posthog_session_replay_url?: string;
}

export interface ContactMessageSchema {
  message: string;
  contact_info: string;
  user?: ContactMessageUserSchema;
  auth_email?: string;
  topic?: ContactMessageTopic;
  analytics?: ContactMessageAnalyticsSchema;
  locale?: string;
  source_path?: string;
  user_agent?: string;
  createdAt: Date;
}
