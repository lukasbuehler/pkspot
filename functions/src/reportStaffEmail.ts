import {recordValue, reportReasons, stringValue, type UnknownRecord} from "./reportLifecycleHelpers";

export type StaffReportKind = "spot" | "media" | "profile";

export interface ReportStaffEmailInput {
  kind: StaffReportKind;
  reportId: string;
  sourcePath: string;
  data: UnknownRecord;
  /** Account email resolved from Firebase Auth for signed-in reporters. */
  accountEmail?: string;
  accountEmailVerified?: boolean;
  /** Spot or event display name resolved by the trigger. */
  targetName?: string;
}

const SITE = "https://pkspot.app/en";
const EMAIL_PATTERN = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const safeEmail = (value: unknown): string | undefined => {
  const email = stringValue(value);
  return email && email.length <= 254 && EMAIL_PATTERN.test(email) ? email : undefined;
};

const safeId = (value: unknown): string | undefined => {
  const id = stringValue(value);
  return id && SAFE_ID.test(id) ? id : undefined;
};

/** Scanner results that must never be previewed or forwarded by email. */
export const isRestrictedReport = (data: UnknownRecord): boolean => {
  const scanner = recordValue(data["scanner"]);
  const media = recordValue(data["media"]);
  return scanner["decision"] === "reportable_match" ||
    scanner["severity"] === "known_csam_match" ||
    media["scanner_decision"] === "reportable_match" ||
    media["scanner_severity"] === "known_csam_match";
};

const reviewIdFromPath = (value: unknown): string | undefined =>
  stringValue(value)?.match(/^media_upload_reviews\/([A-Za-z0-9_-]+)$/u)?.[1];

const incidentLink = (value: unknown): string | undefined => {
  const id = stringValue(value)?.match(/^safety_incidents\/([A-Za-z0-9_-]+)$/u)?.[1];
  return id ? `${SITE}/moderation/incidents/${id}` : undefined;
};

const targetLink = (input: ReportStaffEmailInput): string | undefined => {
  const {data, kind} = input;
  if (kind === "spot") {
    const spotId = safeId(recordValue(data["spot"])["id"]) ?? safeId(input.sourcePath.split("/")[1]);
    return spotId ? `${SITE}/map/spots/${spotId}` : undefined;
  }
  if (kind === "profile") {
    const uid = safeId(recordValue(data["reportedUser"])["uid"]);
    return uid ? `${SITE}/u/${uid}` : undefined;
  }
  const targetId = safeId(data["targetId"]) ?? safeId(data["spotId"]);
  if (!targetId) return undefined;
  return data["context"] === "event" ?
    `${SITE}/events/${targetId}` :
    `${SITE}/map/spots/${targetId}`;
};

const reporterLines = (input: ReportStaffEmailInput): string[] => {
  const user = recordValue(input.data["user"]);
  const submission = recordValue(input.data["submission"]);
  const uid = stringValue(user["uid"]);
  if (uid === "system_media_scanner") return ["Reporter: Media safety scanner"];
  const name = stringValue(user["display_name"]);
  const email = input.accountEmail ?? safeEmail(user["email"]);
  const verified = input.accountEmail ?
    input.accountEmailVerified === true :
    user["email_verified"] === true;
  const identity = uid ?
    `${name ? `${name} ` : ""}(uid ${uid})` :
    "Guest (not signed in)";
  return [
    `Reporter: ${identity}`,
    `Reporter email: ${email ? `${email}${verified ? "" : " (unverified)"}` : "none given"}`,
    ...(submission["app_check"] !== undefined ?
      [`App Check: ${submission["app_check"] === true ? "verified" : "missing"}`] :
      []),
  ];
};

/**
 * Builds the internal support email for a new report. Reporter text only goes
 * into the body and a validated Reply-To; it never chooses sender or recipient.
 */
export function buildReportStaffEmail(input: ReportStaffEmailInput) {
  const {data, kind, reportId} = input;
  const isScanner = data["source"] === "scanner";
  const restricted = kind === "media" && isRestrictedReport(data);
  const reasons = reportReasons(data).join(", ");
  const label = kind === "spot" ? "Spot" : kind === "profile" ? "Profile" : "Media";
  const subject = restricted ?
    "[PK Spot] Restricted media safety match: open the incident" :
    isScanner ?
      `[PK Spot] Scanner flagged media: ${reasons}` :
      `[PK Spot] New ${label.toLowerCase()} report: ${reasons}`;

  const reviewId = reviewIdFromPath(data["review_path"]);
  const moderationLink = restricted ?
    incidentLink(data["incident_path"]) ?? `${SITE}/moderation/reports` :
    reviewId ?
      `${SITE}/moderation/media?review=${reviewId}` :
      `${SITE}/moderation/reports`;

  if (restricted) {
    return {
      from: "PK Spot Reports <support@pkspot.app>",
      to: ["support@pkspot.app"],
      subject,
      text: [
        "The media safety scanner returned a restricted match.",
        "Do not preview, download, or forward the file. Follow the restricted incident runbook.",
        "",
        `Report: ${input.sourcePath}`,
        `Open in moderation: ${moderationLink}`,
      ].join("\n"),
    };
  }

  const media = recordValue(data["media"]);
  const comment = stringValue(data["comment"])?.slice(0, 5_000);
  const target = targetLink(input);
  const reporterEmail = isScanner ? undefined : input.accountEmail ?? safeEmail(recordValue(data["user"])["email"]);
  const scanner = recordValue(data["scanner"]);
  const lines = [
    `${isScanner ? "Scanner" : "Community"} ${label.toLowerCase()} report ${reportId}`,
    `Reasons: ${reasons}`,
    ...(input.targetName ? [`Target: ${input.targetName.slice(0, 200)}`] : []),
    ...(target ? [`Target link: ${target}`] : []),
    ...(kind === "media" && stringValue(media["src"]) ? [`Media: ${stringValue(media["src"])}`] : []),
    ...(isScanner && stringValue(scanner["reason"]) ? [`Scanner: ${stringValue(scanner["reason"])}`] : []),
    ...reporterLines(input),
    ...(comment ? ["", "Comment:", comment] : []),
    "",
    `Open in moderation: ${moderationLink}`,
    `Source: ${input.sourcePath}`,
  ];
  return {
    from: "PK Spot Reports <support@pkspot.app>",
    to: ["support@pkspot.app"],
    subject,
    ...(reporterEmail ? {reply_to: reporterEmail} : {}),
    text: lines.join("\n"),
  };
}
