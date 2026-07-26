import { Injectable, inject } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import {
  SessionPersonReference,
  SessionRecordDocument,
  SessionRecordSchema,
  SessionSpotVisitSchema,
} from "../../../../db/schemas/SessionRecordSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

export interface CreateManualSessionInput {
  startedAt: Date;
  endedAt?: Date;
  timeZone?: string;
  spotIds?: readonly string[];
  peoplePresent?: readonly SessionPersonReference[];
}

export interface UpdateSessionRecordInput {
  startedAt: Date;
  endedAt?: Date;
  timeZone: string;
  spotIds: readonly string[];
  peoplePresent: readonly SessionPersonReference[];
}

@Injectable({ providedIn: "root" })
export class SessionRecordsService {
  static readonly CHECK_IN_IDLE_WINDOW_MS = 5 * 60 * 60 * 1000;

  private readonly firestore = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);

  async listMine(limit = 50): Promise<SessionRecordDocument[]> {
    return this.firestore.getCollection<SessionRecordDocument>(
      this.collectionPath(this.requireUserId()),
      [],
      [
        {
          type: "orderBy",
          fieldPath: "started_at_raw_ms",
          direction: "desc",
        },
        { type: "limit", limit },
      ],
    );
  }

  async getMine(recordId: string): Promise<SessionRecordDocument | null> {
    const result = await this.firestore.getDocument<SessionRecordSchema>(
      `${this.collectionPath(this.requireUserId())}/${recordId}`,
    );
    return result ? { ...result, id: recordId } : null;
  }

  async createManual(input: CreateManualSessionInput): Promise<string> {
    const uid = this.requireUserId();
    const now = Timestamp.now();
    const startedAt = Timestamp.fromDate(input.startedAt);
    const endedAt = input.endedAt
      ? Timestamp.fromDate(input.endedAt)
      : undefined;
    const lastActivity = endedAt ?? startedAt;
    return this.firestore.addDocument(this.collectionPath(uid), {
      owner_id: uid,
      source: "manual",
      started_at: startedAt,
      started_at_raw_ms: input.startedAt.getTime(),
      ...(endedAt
        ? {
            ended_at: endedAt,
            ended_at_raw_ms: input.endedAt!.getTime(),
          }
        : {}),
      last_activity_at: lastActivity,
      last_activity_raw_ms:
        input.endedAt?.getTime() ?? input.startedAt.getTime(),
      time_zone: input.timeZone ?? this.systemTimeZone(),
      spot_visits: this.manualSpotVisits(
        input.spotIds ?? [],
        startedAt,
        input.startedAt.getTime(),
        endedAt,
        input.endedAt?.getTime(),
      ),
      people_present: this.cleanPeople(input.peoplePresent ?? []),
      time_created: now,
      time_created_raw_ms: now.toMillis(),
      time_updated: now,
      time_updated_raw_ms: now.toMillis(),
    } satisfies SessionRecordSchema);
  }

  async update(
    recordId: string,
    input: UpdateSessionRecordInput,
  ): Promise<void> {
    const startedAt = Timestamp.fromDate(input.startedAt);
    const endedAt = input.endedAt
      ? Timestamp.fromDate(input.endedAt)
      : undefined;
    const now = Timestamp.now();
    await this.firestore.updateDocument(
      `${this.collectionPath(this.requireUserId())}/${recordId}`,
      {
        started_at: startedAt,
        started_at_raw_ms: input.startedAt.getTime(),
        ...(endedAt
          ? {
              ended_at: endedAt,
              ended_at_raw_ms: input.endedAt!.getTime(),
            }
          : {}),
        last_activity_at: endedAt ?? startedAt,
        last_activity_raw_ms:
          input.endedAt?.getTime() ?? input.startedAt.getTime(),
        time_zone: input.timeZone,
        spot_visits: this.manualSpotVisits(
          input.spotIds,
          startedAt,
          input.startedAt.getTime(),
          endedAt,
          input.endedAt?.getTime(),
        ),
        people_present: this.cleanPeople(input.peoplePresent),
        time_updated: now,
        time_updated_raw_ms: now.toMillis(),
      },
    );
  }

  async recordCheckIn(spotId: string, spotName?: string): Promise<string> {
    const uid = this.requireUserId();
    const now = Timestamp.now();
    const nowMs = now.toMillis();
    const recent = await this.firestore.getCollection<SessionRecordDocument>(
      this.collectionPath(uid),
      [
        {
          fieldPath: "last_activity_raw_ms",
          opStr: ">=",
          value: nowMs - SessionRecordsService.CHECK_IN_IDLE_WINDOW_MS,
        },
      ],
      [
        {
          type: "orderBy",
          fieldPath: "last_activity_raw_ms",
          direction: "desc",
        },
        { type: "limit", limit: 1 },
      ],
    );
    const current = recent[0];
    if (!current) {
      return this.firestore.addDocument(this.collectionPath(uid), {
        owner_id: uid,
        source: "check_in",
        started_at: now,
        started_at_raw_ms: nowMs,
        last_activity_at: now,
        last_activity_raw_ms: nowMs,
        time_zone: this.systemTimeZone(),
        spot_visits: [
          {
            spot_id: spotId,
            ...(spotName ? { spot_name: spotName } : {}),
            arrived_at: now,
            arrived_at_raw_ms: nowMs,
          },
        ],
        people_present: [],
        time_created: now,
        time_created_raw_ms: nowMs,
        time_updated: now,
        time_updated_raw_ms: nowMs,
      } satisfies SessionRecordSchema);
    }

    const visits = this.appendCheckIn(
      current.spot_visits ?? [],
      spotId,
      spotName,
      now,
      nowMs,
    );
    await this.firestore.updateDocument(
      `${this.collectionPath(uid)}/${current.id}`,
      {
        spot_visits: visits,
        last_activity_at: now,
        last_activity_raw_ms: nowMs,
        time_updated: now,
        time_updated_raw_ms: nowMs,
      },
    );
    return current.id;
  }

  async delete(recordId: string): Promise<void> {
    await this.firestore.deleteDocument(
      `${this.collectionPath(this.requireUserId())}/${recordId}`,
    );
  }

  private appendCheckIn(
    visits: readonly SessionSpotVisitSchema[],
    spotId: string,
    spotName: string | undefined,
    now: Timestamp,
    nowMs: number,
  ): SessionSpotVisitSchema[] {
    const next = visits.map((visit) => ({ ...visit }));
    const last = next.at(-1);
    if (last?.spot_id === spotId) {
      last.left_at = now;
      last.left_at_raw_ms = nowMs;
      return next;
    }
    if (last && last.left_at_raw_ms === undefined) {
      last.left_at = now;
      last.left_at_raw_ms = nowMs;
    }
    next.push({
      spot_id: spotId,
      ...(spotName ? { spot_name: spotName } : {}),
      arrived_at: now,
      arrived_at_raw_ms: nowMs,
    });
    return next;
  }

  private manualSpotVisits(
    spotIds: readonly string[],
    arrivedAt: Timestamp,
    arrivedAtMs: number,
    leftAt?: Timestamp,
    leftAtMs?: number,
  ): SessionSpotVisitSchema[] {
    return spotIds.map((spotId) => ({
      spot_id: spotId,
      arrived_at: arrivedAt,
      arrived_at_raw_ms: arrivedAtMs,
      ...(leftAt && leftAtMs !== undefined
        ? { left_at: leftAt, left_at_raw_ms: leftAtMs }
        : {}),
    }));
  }

  private cleanPeople(
    people: readonly SessionPersonReference[],
  ): SessionPersonReference[] {
    const unique = new Map<string, SessionPersonReference>();
    for (const person of people) {
      if (!person.uid || person.uid === this.auth.user.uid) continue;
      unique.set(person.uid, {
        uid: person.uid,
        ...(person.display_name
          ? { display_name: person.display_name }
          : {}),
        ...(person.profile_picture
          ? { profile_picture: person.profile_picture }
          : {}),
      });
    }
    return [...unique.values()];
  }

  private collectionPath(uid: string): string {
    return `users/${uid}/session_records`;
  }

  private systemTimeZone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  private requireUserId(): string {
    const uid = this.auth.user.uid;
    if (!uid) throw new Error("Session records require a signed-in user.");
    return uid;
  }
}
