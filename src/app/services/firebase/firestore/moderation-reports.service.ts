import { inject, Injectable } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import { MediaType } from "../../../../db/models/Interfaces";
import { StorageImage } from "../../../../db/models/Media";
import { ContactMessageSchema } from "../../../../db/schemas/ContactMessageSchema";
import type { MediaSchema } from "../../../../db/schemas/Media";
import { MediaReportSchema } from "../../../../db/schemas/MediaReportSchema";
import { ModerationActionType } from "../../../../db/schemas/ModerationActionSchema";
import { SpotReportSchema } from "../../../../db/schemas/SpotReportSchema";
import { UserReportSchema } from "../../../../db/schemas/UserReportSchema";
import { SearchService } from "../../search.service";
import { isFirstPartyStorageUrl } from "../../../utils/first-party-media-url";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
} from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import type {
  PreviewSpotDuplicateResolutionRequest,
  PreviewSpotDuplicateResolutionResponse,
  ResolveSpotDuplicateRequest,
  ResolveSpotDuplicateResponse,
} from "../../../../db/schemas/SpotDuplicateResolutionSchema";
import type { SpotCreationDiagnosticsResponse } from "../../../../db/schemas/SpotCreationSchema";
import type { SpotSchema } from "../../../../db/schemas/SpotSchema";

export type ModerationReportKind = "spot" | "media" | "profile";
export type ModerationReportStatus = "open" | "resolved" | "dismissed";

export interface ModerationReportItem {
  id: string;
  path: string;
  kind: ModerationReportKind;
  status: ModerationReportStatus;
  reason: string;
  createdAt: unknown;
  createdAtMillis: number;
  reporterLabel: string;
  reporterUid?: string;
  reporterEmail?: string;
  reporterEmailVerified?: boolean;
  submissionChannel?: string;
  submissionAppCheck?: boolean;
  submissionIpAddress?: string;
  submissionIpHash?: string;
  submissionUserAgent?: string;
  submissionOrigin?: string;
  targetLabel: string;
  targetPath?: string;
  comment?: string;
  mediaSrc?: string;
  previewImageSrc?: string;
  spotLocality?: string;
  spotId?: string;
  spotName?: string;
  spotType?: string;
  profileUserId?: string;
  profileImageSrc?: string;
  mediaSource?: "storage" | "external";
  mediaSourceLabel?: string;
  requiresManualReview: boolean;
  scannerProvider?: string;
  scannerDecision?: string;
  scannerReason?: string;
  scannerLabels?: Record<string, string>;
  incidentPath?: string;
  canKeepWarning: boolean;
  canDeleteMedia: boolean;
  raw: SpotReportSchema | MediaReportSchema | UserReportSchema;
}

export interface ModerationContactMessageItem {
  id: string;
  path: string;
  topic: string;
  message: string;
  contactInfo: string;
  createdAt: unknown;
  createdAtMillis: number;
  userLabel: string;
  sourcePath?: string;
  locale?: string;
  replayUrl?: string;
  raw: ContactMessageSchema;
}

export interface ModerationDuplicateSpot {
  id: string;
  label: string;
}

export interface ModerationDuplicateGroup {
  id: string;
  spots: ModerationDuplicateSpot[];
  closestDistanceMeters: number;
}

type DuplicateSpotDocument = Partial<Pick<SpotSchema, "name" | "duplicate_check">> & {
  id: string;
};

const spotLabel = (spot: DuplicateSpotDocument): string => {
  for (const value of Object.values(spot.name ?? {})) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && "text" in value) {
      const text = String(value.text ?? "").trim();
      if (text) return text;
    }
  }
  return spot.id;
};

export const groupDuplicateSpotCandidates = (
  documents: DuplicateSpotDocument[],
): ModerationDuplicateGroup[] => {
  const spots = new Map<string, ModerationDuplicateSpot>();
  const neighbors = new Map<string, Set<string>>();
  const distances = new Map<string, number>();
  const connect = (left: string, right: string, distance: number): void => {
    neighbors.set(left, (neighbors.get(left) ?? new Set()).add(right));
    neighbors.set(right, (neighbors.get(right) ?? new Set()).add(left));
    const key = [left, right].sort().join(":");
    distances.set(key, Math.min(distances.get(key) ?? Infinity, distance));
  };

  for (const document of documents) {
    spots.set(document.id, {id: document.id, label: spotLabel(document)});
    for (const candidate of document.duplicate_check?.candidates ?? []) {
      const current = spots.get(candidate.spot_id);
      spots.set(candidate.spot_id, {
        id: candidate.spot_id,
        label: current?.label ?? candidate.name ?? candidate.spot_id,
      });
      connect(document.id, candidate.spot_id, candidate.distance_m);
    }
  }

  const visited = new Set<string>();
  const groups: ModerationDuplicateGroup[] = [];
  for (const first of neighbors.keys()) {
    if (visited.has(first)) continue;
    const pending = [first];
    const ids: string[] = [];
    visited.add(first);
    while (pending.length > 0) {
      const id = pending.pop()!;
      ids.push(id);
      for (const neighbor of neighbors.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    ids.sort((left, right) =>
      (spots.get(left)?.label ?? left).localeCompare(spots.get(right)?.label ?? right),
    );
    const groupDistances = [...distances.entries()]
      .filter(([key]) => ids.some((id) => key.split(":").includes(id)))
      .map(([, distance]) => distance);
    groups.push({
      id: ids.join(":"),
      spots: ids.map((id) => spots.get(id) ?? {id, label: id}),
      closestDistanceMeters: Math.min(...groupDistances),
    });
  }

  return groups.sort(
    (left, right) =>
      right.spots.length - left.spots.length ||
      left.spots[0].label.localeCompare(right.spots[0].label),
  );
};

type HandleModerationActionRequest = {
  action_type: ModerationActionType;
  source_path: string;
  note?: string;
  spot_warning?: SpotWarningInput;
};

type HandleModerationActionResponse = { ok: boolean };
type CreateSafetyIncidentResponse = { incident_path: string };
type GetModerationMediaPreviewResponse = {
  url: string;
  expires_in_seconds: number;
};
export interface SpotWarningInput {
  type:
    | "destroyed"
    | "inaccessible"
    | "temporarily_closed"
    | "access_concern"
    | "other";
  message: string;
}

@Injectable({
  providedIn: "root",
})
export class ModerationReportsService {
  private readonly _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _searchService = inject(SearchService);
  private readonly _functionsAdapter = inject(FunctionsAdapterService);

  async getReports(limitCount: number = 200): Promise<ModerationReportItem[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: limitCount },
    ];
    const [groupedReports, legacyMediaReports, userReports] = await Promise.all([
      this._firestoreAdapter.getCollectionGroupWithMetadata<
        SpotReportSchema | MediaReportSchema
      >("reports", undefined, constraints),
      this._firestoreAdapter.getCollection<MediaReportSchema & { id: string }>(
        "media_reports",
        undefined,
        constraints,
      ),
      this._firestoreAdapter.getCollection<UserReportSchema & { id: string }>(
        "user_reports",
        undefined,
        constraints,
      ),
    ]);

    const reports = [
      ...groupedReports.data.map((report) =>
        this._isMediaReport(report)
          ? this._mapMediaReport(report)
          : this._mapSpotReport(report),
      ),
      ...legacyMediaReports.map((report) => this._mapMediaReport(report)),
      ...userReports.map((report) => this._mapUserReport(report)),
    ].sort((left, right) => right.createdAtMillis - left.createdAtMillis);

    return this._withSpotPreviews(reports);
  }

  getSpotCreationDiagnostics(): Promise<SpotCreationDiagnosticsResponse> {
    return this._functionsAdapter.call<Record<string, never>, SpotCreationDiagnosticsResponse>(
      "getSpotCreationDiagnostics",
      {},
    );
  }

  async getDuplicateSpotGroups(): Promise<ModerationDuplicateGroup[]> {
    const spots = await this._firestoreAdapter.getCollection<DuplicateSpotDocument>(
      "spots",
      [{fieldPath: "duplicate_check.status", opStr: "==", value: "possible_duplicate"}],
      [{type: "limit", limit: 500}],
    );
    return groupDuplicateSpotCandidates(spots);
  }

  previewSpotDuplicateResolution(
    reportPath: string,
    candidateSpotId: string,
  ): Promise<PreviewSpotDuplicateResolutionResponse> {
    return this._functionsAdapter.call<
      PreviewSpotDuplicateResolutionRequest,
      PreviewSpotDuplicateResolutionResponse
    >("previewSpotDuplicateResolution", { reportPath, candidateSpotId });
  }

  resolveSpotDuplicate(
    request: ResolveSpotDuplicateRequest,
  ): Promise<ResolveSpotDuplicateResponse> {
    return this._functionsAdapter.call<
      ResolveSpotDuplicateRequest,
      ResolveSpotDuplicateResponse
    >("resolveSpotDuplicate", request);
  }

  async getContactMessages(
    limitCount: number = 100,
  ): Promise<ModerationContactMessageItem[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "orderBy", fieldPath: "createdAt", direction: "desc" },
      { type: "limit", limit: limitCount },
    ];
    const messages = await this._firestoreAdapter.getCollection<
      ContactMessageSchema & { id: string }
    >("contact_messages", undefined, constraints);

    return messages
      .map((message) => this._mapContactMessage(message))
      .sort((left, right) => right.createdAtMillis - left.createdAtMillis);
  }

  async handleReport(
    item: ModerationReportItem,
    actionType: Extract<
      ModerationActionType,
      | "close_report"
      | "keep_warning"
      | "publish_spot_warning"
      | "delete_media"
      | "delete_spot"
    >,
    note?: string,
    spotWarning?: SpotWarningInput,
  ): Promise<void> {
    await this._functionsAdapter.call<
      HandleModerationActionRequest,
      HandleModerationActionResponse
    >("handleModerationAction", {
      action_type: actionType,
      source_path: item.path,
      ...(note ? { note } : {}),
      ...(spotWarning ? { spot_warning: spotWarning } : {}),
    });
  }

  async handleContactMessage(
    item: ModerationContactMessageItem,
    actionType: Extract<
      ModerationActionType,
      "archive_contact_message" | "delete_contact_message"
    >,
    note?: string,
  ): Promise<void> {
    await this._functionsAdapter.call<
      HandleModerationActionRequest,
      HandleModerationActionResponse
    >("handleModerationAction", {
      action_type: actionType,
      source_path: item.path,
      ...(note ? { note } : {}),
    });
  }

  private _mapSpotReport(
    report: SpotReportSchema & { id: string; path: string },
  ): ModerationReportItem {
    const status = this._normalizeStatus(report.status);
    const createdAtMillis = this._toMillis(report.createdAt);
    const spotId = report.spot?.id ?? this._spotIdFromReportPath(report.path);
    const spotName = report.spot?.name ?? spotId;

    return {
      id: report.id,
      path: report.path,
      kind: "spot",
      status,
      reason: report.reason || "unknown",
      createdAt: report.createdAt,
      createdAtMillis,
      reporterLabel: this._formatUser(report.user),
      reporterUid: report.user.uid,
      reporterEmail: report.user.email,
      reporterEmailVerified: report.user.email_verified,
      targetLabel: spotName,
      targetPath: spotId ? `/map/spots/${spotId}` : undefined,
      spotId,
      spotName,
      previewImageSrc: report.spot?.imageSrc,
      spotLocality: report.spot?.locality,
      spotType: report.spot?.type,
      canKeepWarning: true,
      canDeleteMedia: false,
      requiresManualReview: false,
      raw: report,
    };
  }

  private _mapMediaReport(
    report: MediaReportSchema & { id: string; path?: string },
  ): ModerationReportItem {
    const status = this._normalizeStatus(report.status);
    const createdAtMillis = this._toMillis(report.createdAt);
    const targetId = report.targetId ?? report.spotId;
    const targetPath = this._mediaReportTargetPath(report);
    const mediaSource = this._isStorageMedia(report.media) ? "storage" : "external";
    const scanner = report.scanner;
    const scannerProvider =
      scanner?.provider ??
      (typeof report.media?.["scanner_provider"] === "string"
        ? report.media["scanner_provider"]
        : undefined);
    const scannerDecision =
      scanner?.decision ??
      (typeof report.media?.["scanner_decision"] === "string"
        ? report.media["scanner_decision"]
        : undefined);
    const requiresManualReview =
      report.source === "scanner" ||
      scannerDecision === "block" ||
      scannerDecision === "needs_review" ||
      scannerDecision === "reportable_match";

    return {
      id: report.id,
      path: report.path ?? `media_reports/${report.id}`,
      kind: "media",
      status,
      reason: report.reason || "unknown",
      createdAt: report.createdAt,
      createdAtMillis,
      reporterLabel: this._formatUser(report.user),
      reporterUid: report.user.uid,
      reporterEmail: report.user.email,
      reporterEmailVerified: report.user.email_verified,
      submissionChannel: report.submission?.channel,
      submissionAppCheck: report.submission?.app_check,
      submissionIpAddress: report.submission?.ip_address,
      submissionIpHash: report.submission?.ip_hash,
      submissionUserAgent: report.submission?.user_agent,
      submissionOrigin: report.submission?.origin,
      targetLabel: targetId ?? report.media?.src ?? report.media?.storage_path ?? "Media",
      targetPath,
      comment: report.comment,
      mediaSrc: report.media?.src,
      previewImageSrc: this._mediaPreviewImageSrc(report.media),
      spotId: report.spotId,
      mediaSource,
      mediaSourceLabel: mediaSource === "storage" ? "Storage media" : "External media",
      canKeepWarning: Boolean(report.media?.src && targetPath),
      canDeleteMedia: Boolean(report.media?.src && targetPath),
      requiresManualReview,
      scannerProvider,
      scannerDecision,
      scannerReason: scanner?.reason,
      scannerLabels: scanner?.labels,
      incidentPath: report.incident_path,
      raw: report,
    };
  }

  private _isMediaReport(
    report: (SpotReportSchema | MediaReportSchema) & {
      id: string;
      path: string;
    },
  ): report is MediaReportSchema & { id: string; path: string } {
    return "media" in report;
  }

  private _mapUserReport(
    report: UserReportSchema & { id: string },
  ): ModerationReportItem {
    const status = this._normalizeStatus(report.status);
    const createdAtMillis = this._toMillis(report.createdAt);
    const profileUserId = report.reportedUser?.uid;

    return {
      id: report.id,
      path: `user_reports/${report.id}`,
      kind: "profile",
      status,
      reason: report.reason || "unknown",
      createdAt: report.createdAt,
      createdAtMillis,
      reporterLabel: this._formatUser(report.user),
      reporterUid: report.user.uid,
      reporterEmail: report.user.email,
      reporterEmailVerified: report.user.email_verified,
      targetLabel:
        report.reportedUser?.display_name ?? profileUserId ?? "Profile",
      targetPath: profileUserId ? `/u/${profileUserId}` : undefined,
      comment: report.comment,
      profileUserId,
      profileImageSrc: report.reportedUser?.profile_picture,
      previewImageSrc: report.reportedUser?.profile_picture,
      canKeepWarning: false,
      canDeleteMedia: false,
      requiresManualReview: false,
      raw: report,
    };
  }

  async createSafetyIncident(item: ModerationReportItem): Promise<string> {
    const result = await this._functionsAdapter.call<
      { report_path: string },
      CreateSafetyIncidentResponse
    >("createSafetyIncident", { report_path: item.path });
    return result.incident_path;
  }

  async getModerationMediaPreview(item: ModerationReportItem): Promise<string> {
    const result = await this._functionsAdapter.call<
      { report_path: string },
      GetModerationMediaPreviewResponse
    >("getModerationMediaPreview", { report_path: item.path });
    return result.url;
  }

  private _mediaPreviewImageSrc(
    media: MediaReportSchema["media"] | undefined,
  ): string | undefined {
    if (!media?.src) {
      return undefined;
    }

    const schema = media as unknown as MediaSchema;
    if (schema.type === MediaType.Video) {
      return undefined;
    }

    if (!this._isStorageMedia(media)) {
      return schema.src;
    }

    try {
      return StorageImage.fromSchema({
        ...schema,
        isInStorage: true,
        type: MediaType.Image,
      }).getPreviewImageSrc();
    } catch (error) {
      console.warn("Failed to resolve storage media preview URL", error);
      return undefined;
    }
  }

  private _isStorageMedia(media: MediaReportSchema["media"] | undefined): boolean {
    return Boolean(
      media?.is_in_storage ||
        media?.["isInStorage"] ||
        isFirstPartyStorageUrl(media?.src),
    );
  }

  private async _withSpotPreviews(
    reports: ModerationReportItem[],
  ): Promise<ModerationReportItem[]> {
    const spotIds = reports
      .filter((report) => report.kind === "spot" && report.spotId)
      .map((report) => report.spotId as string);

    if (spotIds.length === 0) {
      return reports;
    }

    try {
      const previews = await this._searchService.searchSpotPreviewsByIds(spotIds);
      const previewsById = new Map(
        previews.map((preview) => [String(preview.id), preview]),
      );

      return reports.map((report) => {
        if (report.kind !== "spot" || !report.spotId) {
          return report;
        }
        const preview = previewsById.get(report.spotId);
        if (!preview) {
          return report;
        }
        return {
          ...report,
          targetLabel: preview.name || report.targetLabel,
          spotName: preview.name || report.spotName,
          previewImageSrc: preview.imageSrc || report.previewImageSrc,
          spotLocality: preview.locality || report.spotLocality,
          spotType: preview.type || report.spotType,
        };
      });
    } catch (error) {
      console.warn("Failed to enrich moderation spot reports with previews", error);
      return reports;
    }
  }

  private _mapContactMessage(
    message: ContactMessageSchema & { id: string },
  ): ModerationContactMessageItem {
    return {
      id: message.id,
      path: `contact_messages/${message.id}`,
      topic: message.topic ?? "general",
      message: message.message,
      contactInfo: message.contact_info,
      createdAt: message.createdAt,
      createdAtMillis: this._toMillis(message.createdAt),
      userLabel: this._formatContactUser(message),
      sourcePath: message.source_path,
      locale: message.locale,
      replayUrl: message.analytics?.posthog_session_replay_url,
      raw: message,
    };
  }

  private _normalizeStatus(
    status: ModerationReportStatus | undefined,
  ): ModerationReportStatus {
    return status === "resolved" || status === "dismissed" ? status : "open";
  }

  private _formatUser(user: MediaReportSchema["user"]): string {
    if ("display_name" in user && user.display_name) {
      return user.display_name;
    }
    if ("email" in user && user.email) {
      return user.email;
    }
    if ("uid" in user && user.uid) {
      return user.uid;
    }
    return "Unknown";
  }

  private _formatContactUser(message: ContactMessageSchema): string {
    if (message.user?.display_name) {
      return message.user.display_name;
    }
    if (message.user?.email) {
      return message.user.email;
    }
    if (message.auth_email) {
      return message.auth_email;
    }
    if (message.user?.uid) {
      return message.user.uid;
    }
    return "Anonymous";
  }

  private _spotIdFromReportPath(path: string): string | undefined {
    return path.match(/^spots\/([^/]+)\/reports\/[^/]+$/)?.[1];
  }

  private _mediaReportTargetPath(
    report: MediaReportSchema,
  ): string | undefined {
    if (report.context === "event" && report.targetId) {
      return `/events/${report.targetId}`;
    }
    const spotId = report.spotId ?? report.targetId;
    return spotId ? `/map/spots/${spotId}` : undefined;
  }

  private _toMillis(value: unknown): number {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (value instanceof Timestamp) {
      return value.toMillis();
    }

    if (value && typeof value === "object") {
      const maybeTimestamp = value as {
        toMillis?: () => number;
        seconds?: number;
      };
      if (typeof maybeTimestamp.toMillis === "function") {
        return maybeTimestamp.toMillis();
      }
      if (typeof maybeTimestamp.seconds === "number") {
        return maybeTimestamp.seconds * 1000;
      }
    }

    return 0;
  }
}
