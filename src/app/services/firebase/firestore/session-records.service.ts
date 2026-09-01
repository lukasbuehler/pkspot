import { Injectable, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import {
  ConfirmCheckInRequest,
  ConfirmCheckInResponse,
  DeleteAllCheckInsResponse,
  DeleteCheckInResponse,
} from "../../../../db/schemas/CheckInActivitySchema";
import {
  SessionPersonReference,
  SessionRecordDocument,
  SessionRecordSchema,
  SessionSpotVisitSchema,
} from "../../../../db/schemas/SessionRecordSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";

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

export interface CheckInHistoryItem {
  checkInId: string;
  sessionRecordId: string;
  spotId: string;
  spotName?: string;
  arrivedAtRawMs: number;
}

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_TRAINING_SESSIONS__?: SessionRecordDocument[];
}

@Injectable({ providedIn: "root" })
export class SessionRecordsService {
  static readonly CHECK_IN_IDLE_WINDOW_MS = 5 * 60 * 60 * 1000;

  private readonly firestore = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);
  private readonly functions = inject(FunctionsAdapterService);

  async listMine(limit = 50): Promise<SessionRecordDocument[]> {
    const fixture = this.screenshotSessions();
    if (fixture) return fixture.slice(0, limit);
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
    const fixture = this.screenshotSessions();
    if (fixture) return fixture.find((session) => session.id === recordId) ?? null;
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

  confirmCheckIn(
    input: ConfirmCheckInRequest,
  ): Promise<ConfirmCheckInResponse> {
    this.requireUserId();
    return this.functions.callAuthenticatedAppChecked<
      ConfirmCheckInRequest,
      ConfirmCheckInResponse
    >("confirmCheckIn", input);
  }

  async listCheckIns(limit = 200): Promise<CheckInHistoryItem[]> {
    const sessions = await this.listMine(limit);
    return sessions
      .flatMap((session) =>
        (session.spot_visits ?? []).flatMap((visit) => {
          if (!visit.check_in_id) return [];
          return [{
            checkInId: visit.check_in_id,
            sessionRecordId: session.id,
            spotId: visit.spot_id,
            ...(visit.spot_name ? { spotName: visit.spot_name } : {}),
            arrivedAtRawMs: visit.arrived_at_raw_ms,
          } satisfies CheckInHistoryItem];
        }),
      )
      .sort((first, second) => second.arrivedAtRawMs - first.arrivedAtRawMs);
  }

  deleteCheckIn(checkInId: string): Promise<DeleteCheckInResponse> {
    this.requireUserId();
    return this.functions.callAuthenticatedAppChecked<
      { checkInId: string },
      DeleteCheckInResponse
    >("deleteCheckIn", { checkInId });
  }

  deleteAllCheckIns(): Promise<DeleteAllCheckInsResponse> {
    this.requireUserId();
    return this.functions.callAuthenticatedAppChecked<
      Record<string, never>,
      DeleteAllCheckInsResponse
    >("deleteAllCheckIns", {});
  }

  async exportCheckIns(): Promise<string> {
    const checkIns = await this.listCheckIns(500);
    return JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        check_ins: checkIns.map((checkIn) => ({
          spot_id: checkIn.spotId,
          ...(checkIn.spotName ? { spot_name: checkIn.spotName } : {}),
          checked_in_at: new Date(checkIn.arrivedAtRawMs).toISOString(),
        })),
      },
      null,
      2,
    );
  }

  async delete(recordId: string): Promise<void> {
    await this.firestore.deleteDocument(
      `${this.collectionPath(this.requireUserId())}/${recordId}`,
    );
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

  private screenshotSessions(): SessionRecordDocument[] | null {
    const fixture = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_TRAINING_SESSIONS__;
    return fixture ? [...fixture] : null;
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
