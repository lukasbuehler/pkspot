import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import { persistAuthoritativeReporter } from "./reportIdentity";
import { publicSpotWarningForReason } from "./spotPublicWarning";

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

interface ResolveSpotReportRequest {
  reportPath: string;
  status: "resolved" | "dismissed";
  resolutionNote?: string;
}

const discordWebhookUrl = defineSecret("DISCORD_WEBHOOK_URL");

const _isAdminUser = async (uid: string): Promise<boolean> => {
  const userSnap = await admin.firestore().doc(`users/${uid}`).get();
  return userSnap.data()?.["is_admin"] === true;
};

const _parseSpotReportPath = (
  path: string,
): { spotId: string; reportId: string } => {
  const match = path.match(/^spots\/([^/]+)\/reports\/([^/]+)$/);
  if (!match) {
    throw new HttpsError("invalid-argument", "Invalid spot report path.");
  }

  return { spotId: match[1], reportId: match[2] };
};

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
    const reportSnapshot = event.data;
    const reportData = reportSnapshot?.data() as SpotReportData | undefined;

    if (!reportSnapshot || !reportData) {
      logger.warn(`No data found for spot report ${reportId}`);
      return;
    }

    reportData.user = await persistAuthoritativeReporter(
      reportSnapshot.ref,
      reportData.user,
    );

    const spotRef = admin.firestore().collection("spots").doc(spotId);
    const reportReason = reportData.reason || "other";
    const publicWarning = publicSpotWarningForReason(reportReason);
    await spotRef.update({
      is_reported: true,
      report_reason: publicWarning.message,
      report_count: FieldValue.increment(1),
      latest_report_at: FieldValue.serverTimestamp(),
      public_notice: {
        ...publicWarning,
        published_at: FieldValue.serverTimestamp(),
        source: "community_report",
      },
    });

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

export const resolveSpotReport = onCall<ResolveSpotReportRequest>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid || !(await _isAdminUser(uid))) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const { reportPath, status, resolutionNote } = request.data;
    if (status !== "resolved" && status !== "dismissed") {
      throw new HttpsError("invalid-argument", "Invalid report status.");
    }

    const { spotId } = _parseSpotReportPath(reportPath);
    const db = admin.firestore();
    const reportRef = db.doc(reportPath);
    const spotRef = db.collection("spots").doc(spotId);
    const now = FieldValue.serverTimestamp();
    const resolvedBy = { uid };

    await reportRef.update({
      status,
      resolvedAt: now,
      resolvedBy,
      resolutionNote: resolutionNote || FieldValue.delete(),
    });

    const reportsSnapshot = await spotRef.collection("reports").get();
    const hasOpenReports = reportsSnapshot.docs.some((doc) => {
      if (doc.ref.path === reportRef.path) {
        return false;
      }
      const reportStatus = doc.data()["status"];
      return reportStatus !== "resolved" && reportStatus !== "dismissed";
    });

    if (!hasOpenReports) {
      await spotRef.update({
        is_reported: FieldValue.delete(),
        report_reason: FieldValue.delete(),
        isReported: FieldValue.delete(),
        reportReason: FieldValue.delete(),
        latest_report_at: FieldValue.delete(),
        public_notice: FieldValue.delete(),
      });
    }

    return { ok: true };
  },
);
