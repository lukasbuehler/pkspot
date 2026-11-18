import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";
import {onDocumentCreated, onDocumentWritten} from "firebase-functions/v2/firestore";
import {recordValue, stringValue, type UnknownRecord} from "./reportLifecycleHelpers";
import {buildReportStaffEmail, type StaffReportKind} from "./reportStaffEmail";
import {deliverStaffEmail} from "./staffEmailDelivery";

/** Shares the support mailbox's Resend key with the contact form. */
const resendKey = defineSecret("CONTACT_RESEND_API_KEY");
const isEmulator =
  process.env.FUNCTIONS_EMULATOR === "true" || !!process.env.FIRESTORE_EMULATOR_HOST;
const triggerOptions = {region: "europe-west1", secrets: [resendKey], retry: true};

const nameFromLocalized = (value: unknown): string | undefined => {
  const direct = stringValue(value);
  if (direct) return direct;
  for (const entry of Object.values(recordValue(value))) {
    const text = stringValue(entry) ?? stringValue(recordValue(entry)["text"]);
    if (text) return text;
  }
  return undefined;
};

const resolveTargetName = async (
  kind: StaffReportKind,
  data: UnknownRecord,
): Promise<string | undefined> => {
  if (kind === "spot") return stringValue(recordValue(data["spot"])["name"]);
  if (kind === "profile") return stringValue(recordValue(data["reportedUser"])["display_name"]);
  const targetId = stringValue(data["targetId"]) ?? stringValue(data["spotId"]);
  if (!targetId || !/^[A-Za-z0-9_-]{1,128}$/u.test(targetId)) return undefined;
  const collection = data["context"] === "event" ? "events" : "spots";
  try {
    const target = await admin.firestore().doc(`${collection}/${targetId}`).get();
    return nameFromLocalized(target.data()?.["name"]);
  } catch {
    return undefined;
  }
};

const resolveAccount = async (
  data: UnknownRecord,
): Promise<{accountEmail?: string; accountEmailVerified?: boolean}> => {
  const uid = stringValue(recordValue(data["user"])["uid"]);
  if (!uid || uid === "system_media_scanner") return {};
  try {
    const user = await admin.auth().getUser(uid);
    return user.email ? {accountEmail: user.email, accountEmailVerified: user.emailVerified} : {};
  } catch {
    return {};
  }
};

const sendReportStaffEmail = async (params: {
  kind: StaffReportKind;
  reportId: string;
  sourcePath: string;
  deliveryId: string;
  createdAtMs: number;
  data: UnknownRecord;
}): Promise<void> => {
  if (isEmulator) {
    logger.info("Skipping report staff email in the emulator", {sourcePath: params.sourcePath});
    return;
  }
  const [targetName, account] = await Promise.all([
    resolveTargetName(params.kind, params.data),
    resolveAccount(params.data),
  ]);
  await deliverStaffEmail({
    deliveryPath: `report_email_delivery/${params.deliveryId}`,
    idempotencyKey: `report-${params.deliveryId}`,
    createdAtMs: params.createdAtMs,
    apiKey: () => resendKey.value(),
    email: buildReportStaffEmail({
      kind: params.kind,
      reportId: params.reportId,
      sourcePath: params.sourcePath,
      data: params.data,
      ...account,
      ...(targetName ? {targetName} : {}),
    }),
  });
};

/** Media reports from the callable, older direct-write clients, and the scanner. */
export const onRootReportStaffEmailCreate = onDocumentCreated(
  {...triggerOptions, document: "reports/{reportId}"},
  async (event) => {
    if (!event.data) return;
    const data = event.data.data() as UnknownRecord;
    if (data["kind"] !== undefined && data["kind"] !== "media") return;
    await sendReportStaffEmail({
      kind: "media",
      reportId: event.params.reportId,
      sourcePath: event.data.ref.path,
      deliveryId: `media_${event.params.reportId}`,
      createdAtMs: event.data.createTime.toMillis(),
      data,
    });
  },
);

/** Oldest app versions still write guest-capable media reports here. */
export const onLegacyMediaReportStaffEmailCreate = onDocumentCreated(
  {...triggerOptions, document: "media_reports/{reportId}"},
  async (event) => {
    if (!event.data) return;
    await sendReportStaffEmail({
      kind: "media",
      reportId: event.params.reportId,
      sourcePath: event.data.ref.path,
      deliveryId: `legacy_media_${event.params.reportId}`,
      createdAtMs: event.data.createTime.toMillis(),
      data: event.data.data() as UnknownRecord,
    });
  },
);

/**
 * Spot reports become canonical either at callable creation or when the
 * legacy bridge accepts a raw client write. Superseded duplicates and later
 * edits by the same reporter never send another email.
 */
export const onSpotReportStaffEmailWrite = onDocumentWritten(
  {...triggerOptions, document: "spots/{spotId}/reports/{reportId}"},
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() as UnknownRecord;
    const isCanonical = (value: UnknownRecord | undefined) =>
      recordValue(value?.["submission"])["canonical"] === true;
    const before = event.data?.before.exists ?
      event.data.before.data() as UnknownRecord :
      undefined;
    if (!isCanonical(data) || isCanonical(before) || data["status"] === "superseded") return;
    await sendReportStaffEmail({
      kind: "spot",
      reportId: event.params.reportId,
      sourcePath: after.ref.path,
      deliveryId: `spot_${event.params.spotId}_${event.params.reportId}`,
      createdAtMs: after.createTime?.toMillis() ?? Date.now(),
      data,
    });
  },
);

export const onUserReportStaffEmailCreate = onDocumentCreated(
  {...triggerOptions, document: "user_reports/{reportId}"},
  async (event) => {
    if (!event.data) return;
    await sendReportStaffEmail({
      kind: "profile",
      reportId: event.params.reportId,
      sourcePath: event.data.ref.path,
      deliveryId: `profile_${event.params.reportId}`,
      createdAtMs: event.data.createTime.toMillis(),
      data: event.data.data() as UnknownRecord,
    });
  },
);
