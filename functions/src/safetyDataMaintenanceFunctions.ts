import * as admin from "firebase-admin";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {persistAuthoritativeReporter} from "./reportIdentity";
import {publicSpotWarningForReason} from "./spotPublicWarning";

const db = admin.firestore();
const SPOT_REPORT_PRIVACY_STATE = "maintenance/spot-report-privacy";

const assertAdmin = async (uid: string | undefined): Promise<void> => {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const user = await db.doc(`users/${uid}`).get();
  if (user.data()?.["is_admin"] !== true) {
    throw new HttpsError("permission-denied", "Admin access required.");
  }
};

export const runSafetyDataCleanup = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);

  let homeSpotsRemoved = 0;
  const users = await db.collection("users").get();
  const userWriter = db.bulkWriter();
  for (const user of users.docs) {
    if ("home_spots" in user.data()) {
      homeSpotsRemoved++;
      userWriter.update(user.ref, {
        home_spots: admin.firestore.FieldValue.delete(),
      });
    }
  }
  await userWriter.close();

  let reviewTextsArchived = 0;
  const reviews = await db.collectionGroup("reviews").get();
  for (const review of reviews.docs) {
    const source = review.data();
    if (!source["comment"] || typeof source["comment"] !== "object") {
      continue;
    }

    reviewTextsArchived++;
    const archiveId = Buffer.from(review.ref.path).toString("base64url");
    await db.runTransaction(async (transaction) => {
      transaction.set(db.doc(`legacy_review_texts/${archiveId}`), {
        source_path: review.ref.path,
        comment: source["comment"],
        ...(typeof source["rating"] === "number" ?
          {rating: source["rating"]} :
          {}),
        ...(source["user"] && typeof source["user"] === "object" ?
          {user: source["user"]} :
          {}),
        archived_at: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.update(review.ref, {
        comment: admin.firestore.FieldValue.delete(),
      });
    });
  }

  return {
    users_scanned: users.size,
    home_spots_removed: homeSpotsRemoved,
    reviews_scanned: reviews.size,
    review_texts_archived: reviewTextsArchived,
  };
});

export const backfillReportReporterIdentities = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);

  const [groupedReports, legacyMediaReports, userReports] = await Promise.all([
    db.collectionGroup("reports").get(),
    db.collection("media_reports").get(),
    db.collection("user_reports").get(),
  ]);
  const reports = [
    ...groupedReports.docs,
    ...legacyMediaReports.docs,
    ...userReports.docs,
  ];

  let reportersUpdated = 0;
  let reportsWithoutUid = 0;
  for (const report of reports) {
    const user = report.data()["user"];
    if (!user || typeof user !== "object" || typeof user["uid"] !== "string") {
      reportsWithoutUid++;
      continue;
    }
    await persistAuthoritativeReporter(report.ref, user);
    reportersUpdated++;
  }

  return {
    reports_scanned: reports.length,
    reporters_updated: reportersUpdated,
    reports_without_uid: reportsWithoutUid,
  };
});

const createdAtMillis = (value: unknown): number => {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return 0;
};

/**
 * Writes sanitized public warnings first, then flips the Firestore rules state
 * that makes the underlying reports private. Raw text and reporter identity
 * are never copied onto the public Spot document.
 */
export const migrateSpotReportsToPublicWarnings = onCall(async (request) => {
  await assertAdmin(request.auth?.uid);

  const reports = await db.collectionGroup("reports").get();
  const latestActiveReportBySpot = new Map<
    string,
    { reason: unknown; createdAt: unknown }
  >();

  for (const report of reports.docs) {
    const match = report.ref.path.match(/^spots\/([^/]+)\/reports\/[^/]+$/);
    if (!match) {
      continue;
    }
    const data = report.data();
    if (data["status"] === "resolved" || data["status"] === "dismissed") {
      continue;
    }

    const existing = latestActiveReportBySpot.get(match[1]);
    if (
      !existing ||
      createdAtMillis(data["createdAt"]) >= createdAtMillis(existing.createdAt)
    ) {
      latestActiveReportBySpot.set(match[1], {
        reason: data["reason"],
        createdAt: data["createdAt"],
      });
    }
  }

  let warningsCreated = 0;
  let warningsAlreadyPresent = 0;
  let missingSpots = 0;
  const writer = db.bulkWriter();

  for (const [spotId, report] of latestActiveReportBySpot) {
    const spotRef = db.doc(`spots/${spotId}`);
    const spot = await spotRef.get();
    if (!spot.exists) {
      missingSpots++;
      continue;
    }

    const existingNotice = spot.data()?.["public_notice"];
    if (
      existingNotice &&
      typeof existingNotice === "object" &&
      typeof existingNotice["message"] === "string"
    ) {
      writer.update(spotRef, {
        is_reported: true,
        report_reason: existingNotice["message"],
      });
      warningsAlreadyPresent++;
      continue;
    }

    const warning = publicSpotWarningForReason(report.reason);
    writer.update(spotRef, {
      is_reported: true,
      report_reason: warning.message,
      ...(report.createdAt ? {latest_report_at: report.createdAt} : {}),
      public_notice: {
        ...warning,
        published_at: admin.firestore.FieldValue.serverTimestamp(),
        source: "legacy_report_migration",
      },
    });
    warningsCreated++;
  }

  await writer.close();
  await db.doc(SPOT_REPORT_PRIVACY_STATE).set({
    completed: true,
    completed_at: admin.firestore.FieldValue.serverTimestamp(),
    completed_by: request.auth?.uid,
    reports_scanned: reports.size,
    spots_with_active_reports: latestActiveReportBySpot.size,
    warnings_created: warningsCreated,
    warnings_already_present: warningsAlreadyPresent,
    missing_spots: missingSpots,
  });

  return {
    reports_scanned: reports.size,
    spots_with_active_reports: latestActiveReportBySpot.size,
    warnings_created: warningsCreated,
    warnings_already_present: warningsAlreadyPresent,
    missing_spots: missingSpots,
    privacy_enabled: true,
  };
});
