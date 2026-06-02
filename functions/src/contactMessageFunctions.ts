import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

interface ContactMessageSchema {
  message: string;
  contact_info: string;
  user?: {
    uid: string;
    email?: string;
    display_name?: string;
  };
  auth_email?: string;
  topic?: "general" | "spot-import" | "crew";
  analytics?: {
    posthog_distinct_id?: string;
    posthog_session_id?: string;
    posthog_session_replay_url?: string;
  };
  locale?: string;
  source_path?: string;
  user_agent?: string;
}

const discordContactWebhookUrl = defineSecret("DISCORD_CONTACT_WEBHOOK_URL");

export const onContactMessageCreate = onDocumentCreated(
  {
    document: "contact_messages/{messageId}",
    secrets: [discordContactWebhookUrl],
  },
  async (event) => {
    const messageId = event.params.messageId;
    const messageData = event.data?.data() as ContactMessageSchema | undefined;

    if (!messageData) {
      logger.warn(`No data found for contact message ${messageId}`);
      return;
    }

    const webhookUrl = discordContactWebhookUrl.value();
    if (!webhookUrl) {
      logger.error(
        "DISCORD_CONTACT_WEBHOOK_URL secret not set. Set it with: firebase functions:secrets:set DISCORD_CONTACT_WEBHOOK_URL"
      );
      return;
    }

    const userLabel = messageData.user
      ? `${messageData.user.display_name || messageData.user.uid}${
          messageData.user.email ? ` (${messageData.user.email})` : ""
        }`
      : "Unauthenticated";

    const embed = {
      title: "New PK Spot Contact Message",
      color: 0x2b7fff,
      fields: [
        {
          name: "Topic",
          value: messageData.topic || "general",
          inline: true,
        },
        {
          name: "Message ID",
          value: messageId,
          inline: true,
        },
        {
          name: "Contact Info",
          value: truncateDiscordField(messageData.contact_info),
          inline: false,
        },
        {
          name: "User",
          value: userLabel,
          inline: false,
        },
        ...(messageData.auth_email
          ? [
              {
                name: "Signed-in Email",
                value: messageData.auth_email,
                inline: true,
              },
            ]
          : []),
        ...(messageData.locale
          ? [
              {
                name: "Locale",
                value: messageData.locale,
                inline: true,
              },
            ]
          : []),
        ...(messageData.source_path
          ? [
              {
                name: "Source",
                value: truncateDiscordField(messageData.source_path),
                inline: false,
              },
            ]
          : []),
        ...(messageData.analytics?.posthog_distinct_id
          ? [
              {
                name: "PostHog Distinct ID",
                value: messageData.analytics.posthog_distinct_id,
                inline: true,
              },
            ]
          : []),
        ...(messageData.analytics?.posthog_session_id
          ? [
              {
                name: "PostHog Session ID",
                value: messageData.analytics.posthog_session_id,
                inline: true,
              },
            ]
          : []),
        ...(messageData.analytics?.posthog_session_replay_url
          ? [
              {
                name: "PostHog Replay",
                value: truncateDiscordField(
                  messageData.analytics.posthog_session_replay_url
                ),
                inline: false,
              },
            ]
          : []),
        {
          name: "Message",
          value: truncateDiscordField(messageData.message),
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: null,
        embeds: [embed],
      }),
    });

    if (!response.ok) {
      logger.error(
        `Discord contact webhook failed with status ${response.status}:`,
        await response.text()
      );
      return;
    }

    logger.info(`Discord notification sent for contact message ${messageId}`);
  }
);

function truncateDiscordField(value: string, maxLength = 1000): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}
