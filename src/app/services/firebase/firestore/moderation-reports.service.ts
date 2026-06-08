import { inject, Injectable } from "@angular/core";
import { Functions, httpsCallable } from "@angular/fire/functions";
import { Timestamp } from "@angular/fire/firestore";
import { ContactMessageSchema } from "../../../../db/schemas/ContactMessageSchema";
import { MediaReportSchema } from "../../../../db/schemas/MediaReportSchema";
import { SpotReportSchema } from "../../../../db/schemas/SpotReportSchema";
import { createUserReference } from "../../../../scripts/Helpers";
import { AuthenticationService } from "../authentication.service";
import {
  FirestoreAdapterService,
  QueryConstraintOptions,
} from "../firestore-adapter.service";

export type ModerationReportKind = "spot" | "media";
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
  spotId?: string;
  spotName?: string;
  raw: SpotReportSchema | MediaReportSchema;
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
  private readonly _authService = inject(AuthenticationService);
  private readonly _functions = inject(Functions, { optional: true });
  private readonly _resolveSpotReportCallable = this._functions
    ? httpsCallable<
        {
          reportPath: string;
          status: "resolved" | "dismissed";
          resolutionNote?: string;
        },
        { ok: boolean }
      >(this._functions, "resolveSpotReport")
    : null;

  async getReports(limitCount: number = 200): Promise<ModerationReportItem[]> {
    const constraints: QueryConstraintOptions[] = [
      { type: "limit", limit: limitCount },
    ];
    const [spotReports, mediaReports] = await Promise.all([
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
    ]);

    return [
      ...spotReports.data.map((report) => this._mapSpotReport(report)),
      ...mediaReports.map((report) => this._mapMediaReport(report)),
    ].sort((left, right) => right.createdAtMillis - left.createdAtMillis);
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

  async resolveReport(
    item: ModerationReportItem,
    status: "resolved" | "dismissed",
    resolutionNote?: string,
  ): Promise<void> {
    const user = this._authService.user.data;
    const resolvedBy = user ? createUserReference(user) : undefined;
    const update = {
      status,
      resolvedAt: Timestamp.now(),
      ...(resolvedBy ? { resolvedBy } : {}),
      ...(resolutionNote ? { resolutionNote } : {}),
    };

    if (item.kind === "spot") {
      if (!this._resolveSpotReportCallable) {
        throw new Error("Spot report resolution is unavailable.");
      }
      await this._resolveSpotReportCallable({
        reportPath: item.path,
        status,
        ...(resolutionNote ? { resolutionNote } : {}),
      });
      return;
    }

    await this._firestoreAdapter.updateDocument(item.path, update);
  }

  async deleteReport(item: ModerationReportItem): Promise<void> {
    await this._firestoreAdapter.deleteDocument(item.path);
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
      spotId: report.spotId,
      raw: report,
    };
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
