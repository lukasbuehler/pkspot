import { Injectable, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import {
  LogEntryDocument,
  LogEntrySchema,
  LogEntrySessionSummarySchema,
  LogEntryVisibility,
} from "../../../../db/schemas/LogEntrySchema";
import type { SessionRecordDocument } from "../../../../db/schemas/SessionRecordSchema";
import { AuthenticationService } from "../authentication.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

export interface SaveLogEntryInput {
  note: string;
  visibility: LogEntryVisibility;
  sessions: readonly SessionRecordDocument[];
}

@Injectable({ providedIn: "root" })
export class LogEntriesService {
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);

  async listMine(limit = 50): Promise<LogEntryDocument[]> {
    return this.listForOwner(this.requireUserId(), limit);
  }

  async listForOwner(
    ownerId: string,
    limit = 20,
  ): Promise<LogEntryDocument[]> {
    const allowed = await this.allowedVisibilities(ownerId);
    if (allowed === "all") return this.query(ownerId, [], limit);
    const filters: QueryFilter[] = [
      allowed.length === 1
        ? { fieldPath: "visibility", opStr: "==", value: allowed[0] }
        : { fieldPath: "visibility", opStr: "in", value: allowed },
    ];
    return this.query(ownerId, filters, limit);
  }

  async getMine(entryId: string): Promise<LogEntryDocument | null> {
    const result = await this.firestore.getDocument<LogEntrySchema>(
      `${this.collectionPath(this.requireUserId())}/${entryId}`,
    );
    return result ? { ...result, id: entryId } : null;
  }

  async create(input: SaveLogEntryInput): Promise<string> {
    const uid = this.requireUserId();
    if (input.sessions.length === 0) {
      throw new Error("A log entry requires at least one session record.");
    }
    const now = Timestamp.now();
    const activityAtMs = Math.min(
      ...input.sessions.map((session) => session.started_at_raw_ms),
    );
    return this.firestore.addDocument(this.collectionPath(uid), {
      owner_id: uid,
      note: input.note.trim(),
      visibility: input.visibility,
      session_record_ids: input.sessions.map((session) => session.id),
      session_summaries: input.sessions.map((session) =>
        this.summary(session),
      ),
      activity_at: Timestamp.fromMillis(activityAtMs),
      activity_at_raw_ms: activityAtMs,
      time_created: now,
      time_created_raw_ms: now.toMillis(),
      time_updated: now,
      time_updated_raw_ms: now.toMillis(),
    } satisfies LogEntrySchema);
  }

  async update(entryId: string, input: SaveLogEntryInput): Promise<void> {
    if (input.sessions.length === 0) {
      throw new Error("A log entry requires at least one session record.");
    }
    const activityAtMs = Math.min(
      ...input.sessions.map((session) => session.started_at_raw_ms),
    );
    const now = Timestamp.now();
    await this.firestore.updateDocument(
      `${this.collectionPath(this.requireUserId())}/${entryId}`,
      {
        note: input.note.trim(),
        visibility: input.visibility,
        session_record_ids: input.sessions.map((session) => session.id),
        session_summaries: input.sessions.map((session) =>
          this.summary(session),
        ),
        activity_at: Timestamp.fromMillis(activityAtMs),
        activity_at_raw_ms: activityAtMs,
        time_updated: now,
        time_updated_raw_ms: now.toMillis(),
      },
    );
  }

  async delete(entryId: string): Promise<void> {
    await this.firestore.deleteDocument(
      `${this.collectionPath(this.requireUserId())}/${entryId}`,
    );
  }

  private async allowedVisibilities(
    ownerId: string,
  ): Promise<"all" | LogEntryVisibility[]> {
    const viewerId = this.auth.user.uid;
    if (viewerId === ownerId) return "all";
    if (!viewerId) return ["public"];
    const [following, followedBy] = await Promise.all([
      this.firestore.getDocument(`users/${viewerId}/following/${ownerId}`),
      this.firestore.getDocument(`users/${viewerId}/followers/${ownerId}`),
    ]);
    if (following && followedBy) {
      return ["public", "followers", "friends"];
    }
    return following ? ["public", "followers"] : ["public"];
  }

  private query(
    ownerId: string,
    filters: QueryFilter[],
    limit: number,
  ): Promise<LogEntryDocument[]> {
    return this.firestore.getCollection<LogEntryDocument>(
      this.collectionPath(ownerId),
      filters,
      [
        {
          type: "orderBy",
          fieldPath: "activity_at_raw_ms",
          direction: "desc",
        },
        { type: "limit", limit },
      ],
    );
  }

  private summary(
    session: SessionRecordDocument,
  ): LogEntrySessionSummarySchema {
    const endMs = session.ended_at_raw_ms ?? session.last_activity_raw_ms;
    const durationMs = Math.max(0, endMs - session.started_at_raw_ms);
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: session.time_zone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(session.started_at_raw_ms));
    return {
      session_record_id: session.id,
      local_date: localDate,
      ...(durationMs > 0
        ? { duration_minutes: Math.round(durationMs / 60000) }
        : {}),
      spot_count: new Set(
        (session.spot_visits ?? []).map((visit) => visit.spot_id),
      ).size,
    };
  }

  private collectionPath(uid: string): string {
    return `users/${uid}/log_entries`;
  }

  private requireUserId(): string {
    const uid = this.auth.user.uid;
    if (!uid) throw new Error("Training logs require a signed-in user.");
    return uid;
  }
}
