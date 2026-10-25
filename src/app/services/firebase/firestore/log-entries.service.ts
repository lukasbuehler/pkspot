import { FeatureTelemetryService } from "../../feature-telemetry.service";
import { Injectable, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import {
  LogEntryDocument,
  LogEntrySchema,
  LogEntrySessionSummarySchema,
} from "../../../../db/schemas/LogEntrySchema";
import type { SessionRecordDocument } from "../../../../db/schemas/SessionRecordSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

export interface SaveLogEntryInput {
  note: string;
  sessions: readonly SessionRecordDocument[];
}

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__?: LogEntryDocument[];
}

@Injectable({ providedIn: "root" })
export class LogEntriesService {
  private readonly telemetry = inject(FeatureTelemetryService);

  private readonly firestore = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);

  async listMine(limit = 50): Promise<LogEntryDocument[]> {
    const uid = this.requireUserId();
    const fixture = this.screenshotEntries();
    if (fixture) return fixture.filter(entry => entry.owner_id === uid).slice(0, limit);
    return this.firestore.getCollection<LogEntryDocument>(
      this.collectionPath(uid), [],
      [{type: "orderBy", fieldPath: "activity_at_raw_ms", direction: "desc"}, {type: "limit", limit}],
    );
  }

  async getMine(entryId: string): Promise<LogEntryDocument | null> {
    const uid = this.requireUserId();
    const fixture = this.screenshotEntries();
    if (fixture) return fixture.find(entry => entry.id === entryId && entry.owner_id === uid) ?? null;
    const result = await this.firestore.getDocument<LogEntrySchema>(
      `${this.collectionPath(uid)}/${entryId}`,
    );
    return result ? { ...result, id: entryId } : null;
  }

  async create(input: SaveLogEntryInput): Promise<string> {
    return this.telemetry.run("activity_log", "create", async () => {
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
        visibility: "private",
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

    }, true);
  }

  async update(entryId: string, input: SaveLogEntryInput): Promise<void> {
    return this.telemetry.run("activity_log", "update", async () => {
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
          visibility: "private",
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

    }, true);
  }

  async delete(entryId: string): Promise<void> {
    return this.telemetry.run("activity_log", "delete", async () => {
      await this.firestore.deleteDocument(
        `${this.collectionPath(this.requireUserId())}/${entryId}`,
      );

    }, true);
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

  private screenshotEntries(): LogEntryDocument[] | null {
    const fixture = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_TRAINING_LOG_ENTRIES__;
    return fixture ? [...fixture] : null;
  }

  private requireUserId(): string {
    const uid = this.auth.user.uid;
    if (!uid) throw new Error("Training logs require a signed-in user.");
    return uid;
  }
}
