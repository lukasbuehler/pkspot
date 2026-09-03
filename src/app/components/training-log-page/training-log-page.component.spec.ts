import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogEntryDocument } from "../../../db/schemas/LogEntrySchema";
import type { RecoveryPauseDocument } from "../../../db/schemas/RecoveryPauseSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { RecoveryPausesService } from "../../services/firebase/firestore/recovery-pauses.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";
import { TrainingLogPageComponent } from "./training-log-page.component";

const trainingEntry: LogEntryDocument = {
  id: "entry-1",
  owner_id: "user-1",
  note: "Precision practice",
  visibility: "private",
  session_record_ids: ["session-1"],
  session_summaries: [{
    session_record_id: "session-1",
    local_date: "2026-08-04",
    duration_minutes: 90,
    spot_count: 2,
  }],
  activity_at: {} as LogEntryDocument["activity_at"],
  activity_at_raw_ms: new Date("2026-08-04T12:00:00").getTime(),
  time_created: {} as LogEntryDocument["time_created"],
  time_created_raw_ms: 0,
  time_updated: {} as LogEntryDocument["time_updated"],
  time_updated_raw_ms: 0,
};

const recoveryPause: RecoveryPauseDocument = {
  id: "recovery-1",
  owner_id: "user-1",
  started_on: "2026-08-03",
  ended_on: "2026-08-05",
  reason: "injury",
  note: "Give the leg time to heal.",
  time_created: {} as RecoveryPauseDocument["time_created"],
  time_created_raw_ms: 0,
  time_updated: {} as RecoveryPauseDocument["time_updated"],
  time_updated_raw_ms: 0,
};

describe("TrainingLogPageComponent", () => {
  beforeEach(() => TestBed.resetTestingModule());

  it("focuses a selected recovery pause without treating it as a session", async () => {
    const component = createComponent();

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    component.selection.set({
      kind: "recovery-pause",
      recoveryPauseId: recoveryPause.id,
    });

    expect(component.timeline()).toHaveLength(1);
    expect(component.timeline()[0].entries).toEqual([
      expect.objectContaining({
        kind: "recovery",
        id: recoveryPause.id,
        pause: recoveryPause,
      }),
    ]);
  });

  it("keeps training-day selection limited to training entries", async () => {
    const component = createComponent();

    await vi.waitFor(() => expect(component.loading()).toBe(false));

    component.selection.set({ kind: "training-day", dayKey: "2026-08-04" });

    expect(component.timeline()).toHaveLength(1);
    expect(component.timeline()[0].entries).toEqual([
      expect.objectContaining({ kind: "training", id: trainingEntry.id }),
    ]);
  });
});

function createComponent(): TrainingLogPageComponent {
  const auth = {
    authState$: new BehaviorSubject({ uid: "user-1" }),
    user: { uid: "user-1", data: null },
  };
  TestBed.configureTestingModule({
    providers: [
      TrainingLogPageComponent,
      { provide: AuthenticationService, useValue: auth },
      { provide: LogEntriesService, useValue: { listMine: vi.fn().mockResolvedValue([trainingEntry]) } },
      { provide: RecoveryPausesService, useValue: { listMine: vi.fn().mockResolvedValue([recoveryPause]) } },
      { provide: SessionRecordsService, useValue: { listMine: vi.fn().mockResolvedValue([]) } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  });
  return TestBed.inject(TrainingLogPageComponent);
}
