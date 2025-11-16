import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

interface MediaReportSchema {
  media: any;
  reason: string;
  comment: string;
  user: {
    uid?: string;
    email?: string;
    display_name?: string;
  };
  createdAt: any;
  locale?: string;
}

/**
 * Triggered when a new media report is created.
 * Sends a notification to a Discord channel via webhook.
 *
 * Setup:
 * 1. Create a private Discord channel (e.g., #media-reports)
 * 2. Create a webhook: Right-click channel → Integrations → Webhooks → New Webhook
 * 3. Copy the webhook URL
 * 4. Set the secret: firebase functions:secrets:set DISCORD_WEBHOOK_URL
 * 5. Deploy: npm run deploy
 */
const discordWebhookUrl = defineSecret("DISCORD_WEBHOOK_URL");

export const onMediaReportCreate = onDocumentCreated(
  {
    document: "media_reports/{reportId}",
    secrets: [discordWebhookUrl],
  },
  async (event) => {
    const reportId = event.params.reportId;
    const reportData = event.data?.data() as MediaReportSchema | undefined;

    if (!reportData) {
      logger.warn(`No data found for media report ${reportId}`);
      return;
    }

    try {
      logger.info(`New media report created: ${reportId}`, {
        reason: reportData.reason,
        reportedBy: reportData.user.uid,
        mediaUserId: reportData.media.userId,
      });

      // Get Discord webhook URL from params secret
      const webhookUrl = discordWebhookUrl.value();

      if (!webhookUrl) {
        logger.error(
          "DISCORD_WEBHOOK_URL secret not set. Set it with: firebase functions:secrets:set DISCORD_WEBHOOK_URL"
        );
        return;
      } // Create Discord embed message
      const reporterName =
        (reportData.user as any).display_name ||
        (reportData.user as any).email ||
        (reportData.user as any).uid ||
        "Anonymous";

      const embed = {
        title: "🚨 New Media Report",
        color: 0xff6b6b, // Red color
        fields: [
          {
            name: "Report Reason",
            value: reportData.reason,
            inline: true,
          },
          {
            name: "Report ID",
            value: reportId,
            inline: true,
          },
          {
            name: "Reporter",
            value: reporterName,
            inline: true,
          },
          {
            name: "Media Owner UID",
            value: reportData.media.userId || "Unknown",
            inline: true,
          },
          {
            name: "Media Type",
            value: reportData.media.type || "Unknown",
            inline: true,
          },
          ...(reportData.locale
            ? [
                {
                  name: "Reporter Language",
                  value: reportData.locale.toUpperCase(),
                  inline: true,
                },
              ]
            : []),
          ...(reportData.comment
            ? [
                {
                  name: "Reporter's Comment",
                  value: reportData.comment,
                  inline: false,
                },
              ]
            : []),
        ],
        timestamp: new Date().toISOString(),
      };

      // Send to Discord
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
          `Discord webhook failed with status ${response.status}:`,
          await response.text()
        );
        return;
      }

      logger.info(`Discord notification sent for media report ${reportId}`);
    } catch (error) {
      logger.error(
        `Error processing media report ${reportId}:`,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
);
