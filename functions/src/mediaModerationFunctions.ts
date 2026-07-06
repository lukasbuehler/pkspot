import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import { basename, extname, join, posix } from "path";
import * as ffmpeg from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import nodeModule = require("module");
import { googleAPIKey } from "./secrets";
import { DEFAULT_STORAGE_BUCKET } from "./storageBucket";

const sharp = nodeModule.createRequire(__filename)(
  "sharp"
) as typeof import("sharp").default;

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

type MediaSafetyDecision =
  | "allow"
  | "block"
  | "needs_review"
  | "reportable_match";
type MediaSafetySeverity =
  | "none"
  | "explicit_non_child"
  | "possible_child_safety"
  | "known_csam_match";

interface MediaSafetyProviderResult {
  provider: string;
  provider_version: string;
  decision: MediaSafetyDecision;
  severity: MediaSafetySeverity;
  reason?: string;
  labels?: Record<string, string>;
  thresholds?: Record<string, string>;
  perceptual_hashes?: string[];
}

interface MediaSafetyProvider {
  scanImage(bytes: Buffer, metadata: ScanMetadata): Promise<MediaSafetyProviderResult>;
  scanVideoFrames(
    frames: Buffer[],
    metadata: ScanMetadata
  ): Promise<MediaSafetyProviderResult>;
}

interface ScanMetadata {
  contentType?: string;
  storagePath: string;
  sha256: string;
  source: "upload" | "audit";
  emulatorDecision?: MediaSafetyDecision;
}

interface IntakeMetadata {
  uid: string;
  uploadId: string;
  destinationFolder: string;
  destinationFilename: string;
  targetKind?: string;
  targetId?: string;
  cacheControl?: string;
}

interface AuditSummary {
  scanned: number;
  allowed: number;
  flagged: number;
  failed: number;
  skipped: number;
}

const INTAKE_PREFIX = "media_intake/";
const REVIEW_COLLECTION = "media_upload_reviews";
const INCIDENT_COLLECTION = "csam_incidents";
const MEDIA_REPORT_COLLECTION = "media_reports";
const MAINTENANCE_COLLECTION = "maintenance";
const RUN_AUDIT_DOC = `${MAINTENANCE_COLLECTION}/run-audit-media-moderation`;
const AUDIT_PREFIXES = [
  "spot_pictures/",
  "profile_pictures/",
  "post_media/",
  "challenges/",
  "event_media/",
  "resized_originals/spot_pictures/",
  "resized_originals/profile_pictures/",
  "resized_originals/post_media/",
  "resized_originals/challenges/",
  "resized_originals/event_media/",
] as const;

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const VIDEO_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const RESIZED_IMAGE_SUFFIX_RE = /_\d+x\d+$/;

const db = admin.firestore();

const isEmulator = (): boolean => process.env.FUNCTIONS_EMULATOR === "true";
const mediaModerationSecrets = isEmulator() ? [] : [googleAPIKey];

const now = (): FieldValue => FieldValue.serverTimestamp();

const sha256 = (bytes: Buffer): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const normalizeMetadata = (
  metadata: Record<string, string | undefined> | undefined
): Record<string, string> => {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }
  return normalized;
};

const parseIntakePath = (
  filePath: string | undefined
): { uid: string; uploadId: string; filename: string } | null => {
  if (!filePath?.startsWith(INTAKE_PREFIX)) return null;
  const parts = filePath.split("/");
  if (parts.length !== 4 || parts[0] !== "media_intake") return null;
  return {
    uid: parts[1],
    uploadId: parts[2],
    filename: parts[3],
  };
};

const parseIntakeMetadata = (
  filePath: string,
  rawMetadata: Record<string, string | undefined> | undefined
): IntakeMetadata => {
  const parsedPath = parseIntakePath(filePath);
  const metadata = normalizeMetadata(rawMetadata);
  if (!parsedPath) {
    throw new Error(`Invalid intake path: ${filePath}`);
  }
  if (metadata["uid"] !== parsedPath.uid) {
    throw new Error("Intake owner metadata does not match path owner.");
  }
  if (metadata["upload_id"] !== parsedPath.uploadId) {
    throw new Error("Intake upload_id metadata does not match path upload id.");
  }
  const destinationFolder = metadata["destination_folder"];
  const destinationFilename = metadata["destination_filename"];
  if (!destinationFolder || !destinationFilename) {
    throw new Error("Intake upload is missing destination metadata.");
  }

  return {
    uid: parsedPath.uid,
    uploadId: parsedPath.uploadId,
    destinationFolder,
    destinationFilename,
    targetKind: metadata["target_kind"],
    targetId: metadata["target_id"],
    cacheControl: metadata["cache_control"],
  };
};

const validateImage = async (bytes: Buffer): Promise<void> => {
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Image dimensions could not be read.");
  }
};

const writeTempFile = async (
  bytes: Buffer,
  filename: string
): Promise<string> => {
  const path = join(os.tmpdir(), `${Date.now()}_${filename}`);
  await fs.promises.writeFile(path, bytes);
  return path;
};

const validateVideoAndExtractFrames = async (
  bytes: Buffer,
  filename: string
): Promise<Buffer[]> => {
  const videoPath = await writeTempFile(bytes, filename);
  const frameName = `moderation_${Date.now()}_${basename(filename, extname(filename))}.png`;
  const framePath = join(os.tmpdir(), frameName);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        const hasVideo = data.streams.some(
          (stream) => stream.codec_type === "video"
        );
        if (!hasVideo) {
          reject(new Error("No video stream found."));
          return;
        }
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      (ffmpeg as any)(videoPath)
        .screenshots({
          timestamps: [1],
          filename: frameName,
          folder: os.tmpdir(),
        })
        .on("end", () => resolve())
        .on("error", reject);
    });

    return [await fs.promises.readFile(framePath)];
  } finally {
    await fs.promises.unlink(videoPath).catch(() => undefined);
    await fs.promises.unlink(framePath).catch(() => undefined);
  }
};

const isBlockedLikelihood = (value: string | undefined): boolean =>
  value === "LIKELY" || value === "VERY_LIKELY";

const mergeSafetyResults = (
  results: MediaSafetyProviderResult[]
): MediaSafetyProviderResult => {
  const ranked: Record<MediaSafetyDecision, number> = {
    allow: 0,
    needs_review: 1,
    block: 2,
    reportable_match: 3,
  };
  return results.reduce((strongest, result) =>
    ranked[result.decision] > ranked[strongest.decision] ? result : strongest
  );
};

class GoogleVisionSafeSearchProvider implements MediaSafetyProvider {
  async scanImage(
    bytes: Buffer,
    metadata: ScanMetadata
  ): Promise<MediaSafetyProviderResult> {
    const emulatorDecision = this.emulatorResult(metadata);
    if (emulatorDecision) return emulatorDecision;

    const labels = await this.detectSafeSearch(bytes);
    const shouldBlock =
      isBlockedLikelihood(labels["adult"]) ||
      isBlockedLikelihood(labels["racy"]) ||
      isBlockedLikelihood(labels["violence"]);

    return {
      provider: "google_vision_safe_search",
      provider_version: "v1",
      decision: shouldBlock ? "block" : "allow",
      severity: shouldBlock ? "explicit_non_child" : "none",
      reason: shouldBlock
        ? "Vision SafeSearch returned likely explicit or violent content."
        : undefined,
      labels,
      thresholds: {
        adult: "LIKELY",
        racy: "LIKELY",
        violence: "LIKELY",
      },
    };
  }

  async scanVideoFrames(
    frames: Buffer[],
    metadata: ScanMetadata
  ): Promise<MediaSafetyProviderResult> {
    if (frames.length === 0) {
      return {
        provider: "google_vision_safe_search",
        provider_version: "v1",
        decision: "needs_review",
        severity: "explicit_non_child",
        reason: "No video frames were available for moderation.",
      };
    }

    const results = [];
    for (const frame of frames) {
      results.push(await this.scanImage(frame, metadata));
    }
    return mergeSafetyResults(results);
  }

  private emulatorResult(
    metadata: ScanMetadata
  ): MediaSafetyProviderResult | null {
    if (!isEmulator()) return null;
    const decision =
      metadata.emulatorDecision ??
      (process.env.MEDIA_SAFETY_EMULATOR_RESULT as MediaSafetyDecision | undefined) ??
      "allow";
    return {
      provider: "emulator_media_safety",
      provider_version: "v1",
      decision,
      severity:
        decision === "reportable_match"
          ? "known_csam_match"
          : decision === "allow"
          ? "none"
          : "explicit_non_child",
      reason: "Emulator-controlled media safety result.",
    };
  }

  private async detectSafeSearch(bytes: Buffer): Promise<Record<string, string>> {
    const apiKey = googleAPIKey.value();
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY secret is not configured.");
    }

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: { content: bytes.toString("base64") },
            features: [{ type: "SAFE_SEARCH_DETECTION" }],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Vision SafeSearch failed with ${response.status}.`);
    }
    const json = (await response.json()) as {
      responses?: Array<{ safeSearchAnnotation?: Record<string, string> }>;
    };
    return json.responses?.[0]?.safeSearchAnnotation ?? {};
  }
}

const mediaSafetyProvider: MediaSafetyProvider =
  new GoogleVisionSafeSearchProvider();

const contentKind = (contentType: string | undefined): "image" | "video" | null => {
  if (contentType && IMAGE_CONTENT_TYPES.has(contentType)) return "image";
  if (contentType && VIDEO_CONTENT_TYPES.has(contentType)) return "video";
  return null;
};

const destinationPathFor = (
  intake: IntakeMetadata,
  sourceFilename: string
): string => {
  const extension = extname(sourceFilename).toLowerCase();
  const destinationExtension =
    intake.destinationFolder === "profile_pictures" ? "" : extension;
  return posix.join(
    intake.destinationFolder,
    `${intake.destinationFilename}${destinationExtension}`
  );
};

const publicUrlFor = (bucketName: string, path: string): string => {
  const encodedPath = encodeURIComponent(path);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`
    .replace(/\.MP4\?/, ".mp4?")
    .replace(/\.mov\?/i, ".mp4?");
};

const reviewRef = (uploadId: string): admin.firestore.DocumentReference =>
  db.collection(REVIEW_COLLECTION).doc(uploadId);

const writeIncidentIfNeeded = async (
  reviewPath: string,
  source: "upload" | "audit",
  uid: string | undefined,
  storagePath: string | undefined,
  hash: string,
  result: MediaSafetyProviderResult
): Promise<string | undefined> => {
  if (result.decision !== "reportable_match") return undefined;

  const incident = await db.collection(INCIDENT_COLLECTION).add({
    status: "open",
    source,
    review_path: reviewPath,
    ...(uid ? { uid } : {}),
    ...(storagePath ? { storage_path: storagePath } : {}),
    sha256: hash,
    scanner: result,
    created_at: now(),
  });
  return incident.path;
};

const scannerReportReason = (result: MediaSafetyProviderResult): string => {
  if (result.decision === "reportable_match") return "known_csam_match";
  if (result.severity !== "none") return result.severity;
  return `scanner_${result.decision}`;
};

const contextForTargetKind = (
  targetKind: string | undefined
): "spot" | "event" | "media" => {
  if (targetKind === "spot") return "spot";
  if (targetKind === "event" || targetKind === "event_media") return "event";
  return "media";
};

const writeScannerMediaReport = async (params: {
  review: admin.firestore.DocumentReference;
  source: "upload" | "audit";
  uid?: string;
  storagePath: string;
  publicUrl?: string;
  contentType?: string;
  mediaType: "image" | "video";
  hash: string;
  result: MediaSafetyProviderResult;
  targetKind?: string;
  targetId?: string;
  incidentPath?: string;
}): Promise<void> => {
  const reason = scannerReportReason(params.result);
  const reportRef = db
    .collection(MEDIA_REPORT_COLLECTION)
    .doc(`scanner_${params.review.id}`);
  await reportRef.set({
    status: "open",
    source: "scanner",
    scanner_source: params.source,
    review_path: params.review.path,
    ...(params.incidentPath ? { incident_path: params.incidentPath } : {}),
    media: {
      type: params.mediaType,
      ...(params.uid ? { userId: params.uid } : {}),
      ...(params.publicUrl ? { src: params.publicUrl } : {}),
      ...(params.publicUrl ? { is_in_storage: true } : {}),
      storage_path: params.storagePath,
      content_type: params.contentType,
      sha256: params.hash,
      scanner_provider: params.result.provider,
      scanner_decision: params.result.decision,
      scanner_severity: params.result.severity,
    },
    ...(params.targetKind === "spot" && params.targetId
      ? { spotId: params.targetId }
      : {}),
    ...(params.targetId ? { targetId: params.targetId } : {}),
    ...(params.targetKind
      ? { context: contextForTargetKind(params.targetKind) }
      : { context: "media" }),
    reason,
    comment:
      params.result.decision === "reportable_match"
        ? "Media safety scanner returned a reportable match. Do not preview or forward the file; follow the restricted incident runbook."
        : `Media safety scanner flagged this ${params.source === "audit" ? "existing" : "uploaded"} file before publication or normal handling.`,
    user: {
      uid: "system_media_scanner",
      display_name: "Media safety scanner",
    },
    createdAt: now(),
  });
};

const appendSpotMediaEdit = async (
  spotId: string,
  uid: string,
  approvedUrl: string,
  mediaType: "image" | "video"
): Promise<void> => {
  const userSnap = await db.doc(`users/${uid}`).get();
  const userData = userSnap.data() ?? {};

  await db.collection(`spots/${spotId}/edits`).add({
    type: "UPDATE",
    timestamp: Timestamp.now(),
    timestamp_raw_ms: Date.now(),
    likes: 0,
    approved: false,
    user: {
      uid,
      ...(typeof userData["display_name"] === "string"
        ? { display_name: userData["display_name"] }
        : {}),
      ...(typeof userData["profile_picture"] === "string"
        ? { profile_picture: userData["profile_picture"] }
        : {}),
    },
    data: {
      media: [
        {
          src: approvedUrl,
          type: mediaType,
          uid,
          origin: "user",
          isInStorage: true,
        },
      ],
    },
    modification_type: "APPEND",
  });
};

const applyApprovalSideEffects = async (
  intake: IntakeMetadata,
  approvedUrl: string,
  mediaType: "image" | "video"
): Promise<void> => {
  if (intake.targetKind === "spot" && intake.targetId) {
    await appendSpotMediaEdit(intake.targetId, intake.uid, approvedUrl, mediaType);
    return;
  }

  if (intake.targetKind === "profile") {
    await db.doc(`users/${intake.uid}`).update({
      profile_picture: approvedUrl,
    });
  }
};

export const processMediaIntakeUpload = onObjectFinalized(
  {
    bucket: DEFAULT_STORAGE_BUCKET,
    cpu: 2,
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "2GiB",
    maxInstances: 10,
    secrets: mediaModerationSecrets,
  },
  async (event) => {
    const filePath = event.data.name;
    const parsedPath = parseIntakePath(filePath);
    if (!filePath || !parsedPath) return;

    const bucket = getStorage().bucket(event.data.bucket);
    const sourceFile = bucket.file(filePath);
    const intake = parseIntakeMetadata(filePath, event.data.metadata);
    const contentType = event.data.contentType;
    const kind = contentKind(contentType);
    const review = reviewRef(intake.uploadId);

    await review.set({
      status: "scanning",
      source: "upload",
      uid: intake.uid,
      target_kind: intake.targetKind,
      ...(intake.targetId ? { target_id: intake.targetId } : {}),
      intake_path: filePath,
      content_type: contentType,
      destination_folder: intake.destinationFolder,
      destination_filename: intake.destinationFilename,
      created_at: now(),
    });

    try {
      if (!kind) {
        throw new Error(`Unsupported content type: ${contentType ?? "missing"}`);
      }

      const [bytes] = await sourceFile.download();
      const hash = sha256(bytes);
      if (kind === "image") {
        await validateImage(bytes);
      }
      const frames =
        kind === "video"
          ? await validateVideoAndExtractFrames(bytes, parsedPath.filename)
          : [];
      const scanResult =
        kind === "image"
          ? await mediaSafetyProvider.scanImage(bytes, {
              contentType,
              storagePath: filePath,
              sha256: hash,
              source: "upload",
              emulatorDecision: normalizeMetadata(event.data.metadata)[
                "emulator_safety_result"
              ] as MediaSafetyDecision | undefined,
            })
          : await mediaSafetyProvider.scanVideoFrames(frames, {
              contentType,
              storagePath: filePath,
              sha256: hash,
              source: "upload",
              emulatorDecision: normalizeMetadata(event.data.metadata)[
                "emulator_safety_result"
              ] as MediaSafetyDecision | undefined,
            });

      const incidentPath = await writeIncidentIfNeeded(
        review.path,
        "upload",
        intake.uid,
        filePath,
        hash,
        scanResult
      );

      if (scanResult.decision !== "allow") {
        await review.set(
          {
            status:
              scanResult.decision === "reportable_match"
                ? "blocked"
                : "needs_review",
            sha256: hash,
            scan_result: scanResult,
            completed_at: now(),
          },
          { merge: true }
        );
        await writeScannerMediaReport({
          review,
          source: "upload",
          uid: intake.uid,
          storagePath: filePath,
          contentType,
          mediaType: kind,
          hash,
          result: scanResult,
          targetKind: intake.targetKind,
          targetId: intake.targetId,
          incidentPath,
        });
        await sourceFile.delete().catch(() => undefined);
        return;
      }

      const approvedPath = destinationPathFor(intake, parsedPath.filename);
      const approvedUrl = publicUrlFor(bucket.name, approvedPath);
      const approvedFile = bucket.file(approvedPath);
      await approvedFile.save(bytes, {
        resumable: false,
        metadata: {
          contentType,
          cacheControl: intake.cacheControl,
          metadata: {
            uid: intake.uid,
            upload_id: intake.uploadId,
            moderated: "true",
          },
        },
      });

      await applyApprovalSideEffects(intake, approvedUrl, kind);
      await review.set(
        {
          status: "approved",
          sha256: hash,
          scan_result: scanResult,
          approved_path: approvedPath,
          approved_url: approvedUrl,
          completed_at: now(),
        },
        { merge: true }
      );
      await sourceFile.delete().catch(() => undefined);
    } catch (error) {
      await review.set(
        {
          status: "scan_failed",
          failure_reason:
            error instanceof Error ? error.message : String(error),
          completed_at: now(),
        },
        { merge: true }
      );
      await sourceFile.delete().catch(() => undefined);
      console.error("Media intake moderation failed", {
        filePath,
        error,
      });
    }
  }
);

const isAuditEligible = (
  path: string,
  contentType: string | undefined
): boolean => {
  const kind = contentKind(contentType);
  if (!kind) return false;
  const fileName = basename(path);
  if (fileName.startsWith("thumb_")) return false;
  if (fileName.startsWith("comp_") && kind === "image") return false;
  const parsedBase = basename(path, extname(path));
  if (RESIZED_IMAGE_SUFFIX_RE.test(parsedBase)) return false;
  return !path.startsWith(INTAKE_PREFIX);
};

export const runMediaModerationAudit = onDocumentCreated(
  {
    document: RUN_AUDIT_DOC,
    timeoutSeconds: 540,
    memory: "2GiB",
    cpu: 2,
    secrets: mediaModerationSecrets,
  },
  async (event) => {
    const bucket = getStorage().bucket(DEFAULT_STORAGE_BUCKET);
    const summary: AuditSummary = {
      scanned: 0,
      allowed: 0,
      flagged: 0,
      failed: 0,
      skipped: 0,
    };

    for (const prefix of AUDIT_PREFIXES) {
      const [files] = await bucket.getFiles({ prefix });
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const contentType = metadata.contentType;
        if (!isAuditEligible(file.name, contentType)) {
          summary.skipped++;
          continue;
        }

        try {
          const [bytes] = await file.download();
          const hash = sha256(bytes);
          const kind = contentKind(contentType);
          if (!kind) {
            summary.skipped++;
            continue;
          }
          if (kind === "image") {
            await validateImage(bytes);
          }
          const frames =
            kind === "video"
              ? await validateVideoAndExtractFrames(bytes, basename(file.name))
              : [];
          const scanResult =
            kind === "image"
              ? await mediaSafetyProvider.scanImage(bytes, {
                  contentType,
                  storagePath: file.name,
                  sha256: hash,
                  source: "audit",
                })
              : await mediaSafetyProvider.scanVideoFrames(frames, {
                  contentType,
                  storagePath: file.name,
                  sha256: hash,
                  source: "audit",
                });

          summary.scanned++;
          if (scanResult.decision === "allow") {
            summary.allowed++;
            continue;
          }

          summary.flagged++;
          const review = await db.collection(REVIEW_COLLECTION).add({
            status: "audit_flagged",
            source: "audit",
            audited_path: file.name,
            content_type: contentType,
            sha256: hash,
            scan_result: scanResult,
            created_at: now(),
            completed_at: now(),
          });
          const metadataUid = metadata.metadata?.["uid"];
          const uid = typeof metadataUid === "string" ? metadataUid : undefined;
          const incidentPath = await writeIncidentIfNeeded(
            review.path,
            "audit",
            uid,
            file.name,
            hash,
            scanResult
          );
          await writeScannerMediaReport({
            review,
            source: "audit",
            uid,
            storagePath: file.name,
            publicUrl: publicUrlFor(bucket.name, file.name),
            contentType,
            mediaType: kind,
            hash,
            result: scanResult,
            incidentPath,
          });
        } catch (error) {
          summary.failed++;
          console.error("Media moderation audit failed for file", {
            filePath: file.name,
            error,
          });
        }
      }
    }

    await db
      .collection(MAINTENANCE_COLLECTION)
      .doc("last-media-moderation-audit")
      .set({
        ...summary,
        completedAt: new Date(),
      });
    await event.data?.ref.delete();
  }
);
