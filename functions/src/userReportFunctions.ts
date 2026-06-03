import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

interface UserReportData {
  reportedUser?: {
    uid?: string;
    display_name?: string;
    profile_picture?: string;
  };
  reason?: string;
  comment?: string;
  user?: {
    uid?: string;
    display_name?: string;
  };
  sourcePath?: string;
}

const discordWebhookUrl = defineSecret("DISCORD_WEBHOOK_URL");

const formatUser = (user?: UserReportData["user"]): string => {
  if (!user) {
    return "Unknown";
  }

  return user.display_name || user.uid || "Unknown";
};

const truncateDiscordField = (value: string, max = 1000): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3)}...`;
};

export const onUserReportCreate = onDocumentCreated(
  {
    document: "user_reports/{reportId}",
    secrets: [discordWebhookUrl],
  },
  async (event) => {
    const reportId = event.params.reportId;
    const reportData = event.data?.data() as UserReportData | undefined;

    if (!reportData) {
      logger.warn(`No data found for user report ${reportId}`);
      return;
    }

    const webhookUrl = discordWebhookUrl.value();
    if (!webhookUrl) {
      logger.error(
        "DISCORD_WEBHOOK_URL secret not set. Set it with: firebase functions:secrets:set DISCORD_WEBHOOK_URL"
      );
      return;
    }

    const reportedUid = reportData.reportedUser?.uid || "Unknown";
    const appUrl =
      reportedUid === "Unknown"
        ? "https://pkspot.app"
        : `https://pkspot.app/en/u/${reportedUid}`;

    const embed = {
      title: "New Profile Report",
      color: 0xff6b6b,
      url: appUrl,
      fields: [
        {
          name: "Reported User",
          value: formatUser(reportData.reportedUser),
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
          value: formatUser(reportData.user),
          inline: false,
        },
        ...(reportData.sourcePath
          ? [
              {
                name: "Source",
                value: truncateDiscordField(reportData.sourcePath),
                inline: false,
              },
            ]
          : []),
        ...(reportData.comment
          ? [
              {
                name: "Details",
                value: truncateDiscordField(reportData.comment),
                inline: false,
              },
            ]
          : []),
        {
          name: "Open Profile",
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

    logger.info(`Discord notification sent for user report ${reportId}`);
  }
);
