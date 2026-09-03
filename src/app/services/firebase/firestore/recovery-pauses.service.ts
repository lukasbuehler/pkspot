import { Injectable, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import {
  RECOVERY_PAUSE_REASONS,
  type RecoveryPauseDocument,
  type RecoveryPauseReason,
  type RecoveryPauseSchema,
} from "../../../../db/schemas/RecoveryPauseSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";

export const RECOVERY_PAUSE_NOTE_MAX_LENGTH = 500;

export interface SaveRecoveryPauseInput {
  startedOn: string;
  endedOn?: string;
  reason: RecoveryPauseReason;
  note?: string;
}

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_RECOVERY_PAUSES__?: RecoveryPauseDocument[];
}

@Injectable({ providedIn: "root" })
export class RecoveryPausesService {
  private readonly firestore = inject(FirestoreAdapterService);
  private readonly auth = inject(AuthenticationService);

  async listMine(limit = 50): Promise<RecoveryPauseDocument[]> {
    const fixture = this.screenshotPauses();
    if (fixture) return fixture.slice(0, limit);
    return this.firestore.getCollection<RecoveryPauseDocument>(
      this.collectionPath(this.requireUserId()),
      [],
      [
        { type: "orderBy", fieldPath: "started_on", direction: "desc" },
        { type: "limit", limit },
      ],
    );
  }

  async create(input: SaveRecoveryPauseInput): Promise<string> {
    const uid = this.requireUserId();
    this.assertValid(input, await this.listMine());
    const now = Timestamp.now();
    return this.firestore.addDocument(this.collectionPath(uid), {
      owner_id: uid,
      started_on: input.startedOn,
      ...(input.endedOn ? { ended_on: input.endedOn } : {}),
      reason: input.reason,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      time_created: now,
      time_created_raw_ms: now.toMillis(),
      time_updated: now,
      time_updated_raw_ms: now.toMillis(),
    } satisfies RecoveryPauseSchema);
  }

  async update(id: string, input: SaveRecoveryPauseInput): Promise<void> {
    this.assertValid(input, await this.listMine(), id);
    const now = Timestamp.now();
    await this.firestore.updateDocument<Record<string, unknown>>(
      `${this.collectionPath(this.requireUserId())}/${id}`,
      {
        started_on: input.startedOn,
        ...(input.endedOn
          ? { ended_on: input.endedOn }
          : { ended_on: this.firestore.deleteFieldValue() }),
        reason: input.reason,
        ...(input.note?.trim()
          ? { note: input.note.trim() }
          : { note: this.firestore.deleteFieldValue() }),
        time_updated: now,
        time_updated_raw_ms: now.toMillis(),
      },
    );
  }

  delete(id: string): Promise<void> {
    return this.firestore.deleteDocument(
      `${this.collectionPath(this.requireUserId())}/${id}`,
    );
  }

  assertValid(
    input: SaveRecoveryPauseInput,
    existing: readonly RecoveryPauseDocument[],
    excludeId?: string,
    now = new Date(),
  ): void {
    const validationError = validateRecoveryPause(input, existing, excludeId, now);
    if (validationError) throw new Error(validationError);
  }

  private collectionPath(uid: string): string {
    return `users/${uid}/recovery_pauses`;
  }

  private screenshotPauses(): RecoveryPauseDocument[] | null {
    const fixture = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_RECOVERY_PAUSES__;
    return fixture ? [...fixture] : null;
  }

  private requireUserId(): string {
    const uid = this.auth.user.uid;
    if (!uid) throw new Error("Recovery pauses require a signed-in user.");
    return uid;
  }
}

export function validateRecoveryPause(
  input: SaveRecoveryPauseInput,
  existing: readonly RecoveryPauseDocument[],
  excludeId?: string,
  now = new Date(),
): string | null {
  const startedOn = input.startedOn;
  const endedOn = input.endedOn || undefined;
  const today = localDateKey(now);

  if (!isDateKey(startedOn) || (endedOn && !isDateKey(endedOn))) {
    return $localize`:@@recoveryPause.validation.invalidDate:Choose valid recovery dates.`;
  }
  if (startedOn > today || (endedOn && endedOn > today)) {
    return $localize`:@@recoveryPause.validation.futureDate:Recovery dates cannot be in the future.`;
  }
  if (endedOn && endedOn < startedOn) {
    return $localize`:@@recoveryPause.validation.endBeforeStart:The recovery end date must be after the start date.`;
  }
  if (!RECOVERY_PAUSE_REASONS.includes(input.reason)) {
    return $localize`:@@recoveryPause.validation.reason:Choose a recovery reason.`;
  }
  if ((input.note?.trim().length ?? 0) > RECOVERY_PAUSE_NOTE_MAX_LENGTH) {
    return $localize`:@@recoveryPause.validation.noteLength:Keep your private note under 500 characters.`;
  }

  const end = endedOn ?? today;
  const overlap = existing.find((pause) => {
    if (pause.id === excludeId) return false;
    const existingEnd = pause.ended_on ?? today;
    return startedOn <= existingEnd && pause.started_on <= end;
  });
  return overlap
    ? $localize`:@@recoveryPause.validation.overlap:Recovery pauses cannot overlap. End or edit the existing pause first.`
    : null;
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
