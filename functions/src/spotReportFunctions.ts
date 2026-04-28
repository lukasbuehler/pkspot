import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

interface SpotReportData {
  spot?: {
    id?: string;
    name?: string;
  };
  reason?: string;
  duplicateOf?: {
    id?: string;
    name?: string;
  } | string;
  user?: {
    uid?: string;
    email?: string;
    display_name?: string;
  };
}

const discordWebhookUrl = defineSecret("DISCORD_WEBHOOK_URL");

const _formatReporter = (user?: SpotReportData["user"]): string => {
  if (!user) return "Unknown";

  const identity = user.display_name || user.uid || "Unknown";
  return user.email ? `${identity} (${user.email})` : identity;
};

const _formatDuplicateOf = (
  duplicateOf: SpotReportData["duplicateOf"]
): string => {
  if (!duplicateOf) return "Not provided";
  if (typeof duplicateOf === "string") return duplicateOf;
  return duplicateOf.name || duplicateOf.id || "Provided";
};

export const onSpotReportCreate = onDocumentCreated(
  {
    document: "spots/{spotId}/reports/{reportId}",
    secrets: [discordWebhookUrl],
  },
  async (event) => {
    const reportId = event.params.reportId;
    const spotId = event.params.spotId;
    const reportData = event.data?.data() as SpotReportData | undefined;

    if (!reportData) {
      logger.warn(`No data found for spot report ${reportId}`);
      return;
    }

    const webhookUrl = discordWebhookUrl.value();
    if (!webhookUrl) {
      logger.error(
        "DISCORD_WEBHOOK_URL secret not set. Set it with: firebase functions:secrets:set DISCORD_WEBHOOK_URL"
      );
      return;
    }

    const appUrl = `https://pkspot.app/en/s/${spotId}`;
    const embed = {
      title: "New Spot Report",
      color: 0xffb020,
      url: appUrl,
      fields: [
        {
          name: "Spot",
          value: reportData.spot?.name || spotId,
          inline: true,
        },
        {
          name: "Reason",
          value: reportData.reason || "Unknown",
          inline: true,
        },
        {
          name: "Report ID",
          value: reportId,
          inline: true,
        },
        {
          name: "Reporter",
          value: _formatReporter(reportData.user),
          inline: false,
        },
        {
          name: "Duplicate Of",
          value: _formatDuplicateOf(reportData.duplicateOf),
          inline: false,
        },
        {
          name: "Open Spot",
          value: appUrl,
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
        `Discord webhook failed with status ${response.status}:`,
        await response.text()
      );
      return;
    }

    logger.info(`Discord notification sent for spot report ${reportId}`);
  }
);
