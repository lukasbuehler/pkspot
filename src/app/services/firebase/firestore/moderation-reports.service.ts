import { inject, Injectable } from "@angular/core";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Timestamp } from "@angular/fire/firestore";
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

@Injectable({
  providedIn: "root",
})
export class ModerationReportsService {
  private readonly _firestoreAdapter = inject(FirestoreAdapterService);
  private readonly _searchService = inject(SearchService);
  private readonly _functions = inject(Functions, { optional: true });
  private readonly _handleModerationActionCallable = this._functions
    ? httpsCallable<
        {
          action_type: ModerationActionType;
          source_path: string;
          note?: string;
        },
        { ok: boolean }
      >(this._functions, "handleModerationAction")
    : null;

  async getReports(limitCount: number = 200): Promise<ModerationReportItem[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: limitCount },
    ];
    const [spotReports, mediaReports, userReports] = await Promise.all([
      this._firestoreAdapter.getCollectionGroupWithMetadata<SpotReportSchema>(
        "reports",
        undefined,
        constraints,
      ),
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
      ...spotReports.data.map((report) => this._mapSpotReport(report)),
      ...mediaReports.map((report) => this._mapMediaReport(report)),
      ...userReports.map((report) => this._mapUserReport(report)),
    ].sort((left, right) => right.createdAtMillis - left.createdAtMillis);

    return this._withSpotPreviews(reports);
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
      "close_report" | "keep_warning" | "delete_media" | "delete_spot"
    >,
    note?: string,
  ): Promise<void> {
    if (!this._handleModerationActionCallable) {
      throw new Error("Moderation actions are unavailable.");
    }

    await this._handleModerationActionCallable({
      action_type: actionType,
      source_path: item.path,
      ...(note ? { note } : {}),
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
    if (!this._handleModerationActionCallable) {
      throw new Error("Moderation actions are unavailable.");
    }

    await this._handleModerationActionCallable({
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
      targetLabel: spotName,
      targetPath: spotId ? `/map/spots/${spotId}` : undefined,
      spotId,
      spotName,
      previewImageSrc: report.spot?.imageSrc,
      spotLocality: report.spot?.locality,
      spotType: report.spot?.type,
      raw: report,
    };
  }

  private _mapMediaReport(
    report: MediaReportSchema & { id: string },
  ): ModerationReportItem {
    const status = this._normalizeStatus(report.status);
    const createdAtMillis = this._toMillis(report.createdAt);
    const targetId = report.targetId ?? report.spotId;
    const targetPath = this._mediaReportTargetPath(report);
    const mediaSource = this._isStorageMedia(report.media) ? "storage" : "external";

    return {
      id: report.id,
      path: `media_reports/${report.id}`,
      kind: "media",
      status,
      reason: report.reason || "unknown",
      createdAt: report.createdAt,
      createdAtMillis,
      reporterLabel: this._formatUser(report.user),
      targetLabel: targetId ?? report.media?.src ?? "Media",
      targetPath,
      comment: report.comment,
      mediaSrc: report.media?.src,
      previewImageSrc: this._mediaPreviewImageSrc(report.media),
      spotId: report.spotId,
      mediaSource,
      mediaSourceLabel: mediaSource === "storage" ? "Storage media" : "External media",
      raw: report,
    };
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
      targetLabel:
        report.reportedUser?.display_name ?? profileUserId ?? "Profile",
      targetPath: profileUserId ? `/u/${profileUserId}` : undefined,
      comment: report.comment,
      profileUserId,
      profileImageSrc: report.reportedUser?.profile_picture,
      previewImageSrc: report.reportedUser?.profile_picture,
      raw: report,
    };
  }

  private _mediaPreviewImageSrc(
    media: MediaReportSchema["media"] | undefined,
  ): string | undefined {
    if (!media?.src) {
      return undefined;
    }

    const schema = media as MediaSchema;
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
