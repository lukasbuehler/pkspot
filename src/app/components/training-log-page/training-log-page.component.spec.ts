import { StoreReviewService } from "../../reviews/store-review.service";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { provideRouter } from "@angular/router";
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

  it("stops loading on a denied collection and can retry successfully", async () => {
    const listPauses = vi.fn()
      .mockRejectedValueOnce(new Error("Missing or insufficient permissions."))
      .mockResolvedValue([recoveryPause]);
    const component = createComponent(listPauses);

    await vi.waitFor(() => expect(component.loading()).toBe(false));
    expect(component.loadFailed()).toBe(true);
    expect(component.logs()).toEqual([]);

    await component.load();
    expect(component.loadFailed()).toBe(false);
    expect(component.loading()).toBe(false);
    expect(component.logs()).toEqual([trainingEntry]);
    expect(component.recoveryPauses()).toEqual([recoveryPause]);
  });

  it("does not restore private history when a request finishes after sign-out", async () => {
    let resolvePauses!: (pauses: RecoveryPauseDocument[]) => void;
    const component = createComponent(() => new Promise((resolve) => {
      resolvePauses = resolve;
    }));
    const auth = TestBed.inject(AuthenticationService);
    auth.user.uid = "";
    await component.load();
    resolvePauses([recoveryPause]);
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loading()).toBe(false);
    expect(component.logs()).toEqual([]);
    expect(component.recoveryPauses()).toEqual([]);
  });

  it("renders an error and retries through the button in a zoneless view", async () => {
    const listPauses = vi.fn().mockRejectedValue(new Error("Permission denied"));
    createComponent(listPauses);
    const fixture = TestBed.createComponent(TrainingLogPageComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[role="alert"]')?.textContent)
      .toContain("Your training log could not be loaded.");
    expect(element.querySelector("mat-progress-spinner")).toBeNull();

    listPauses.mockResolvedValue([recoveryPause]);
    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await fixture.whenStable();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(element.textContent).toContain(trainingEntry.note);
  });

  it("ignores a stale failure after a newer request succeeds", async () => {
    let rejectPauses!: (reason: Error) => void;
    const listPauses = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => {
        rejectPauses = reject;
      }))
      .mockResolvedValue([recoveryPause]);
    const component = createComponent(listPauses);
    await component.load();
    rejectPauses(new Error("Late failure"));
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadFailed()).toBe(false);
    expect(component.loading()).toBe(false);
    expect(component.recoveryPauses()).toEqual([recoveryPause]);
  });
});

function createComponent(
  listPauses: () => Promise<RecoveryPauseDocument[]> = vi.fn().mockResolvedValue([recoveryPause]),
): TrainingLogPageComponent {
  const auth = {
    authState$: new BehaviorSubject({ uid: "user-1" }),
    user: { uid: "user-1", data: null },
  };
  TestBed.configureTestingModule({
    imports: [TrainingLogPageComponent],
    providers: [
        { provide: StoreReviewService, useValue: { registerCompletionSurface: () => () => {} } },
      provideRouter([]),
      TrainingLogPageComponent,
      { provide: AuthenticationService, useValue: auth },
      { provide: LogEntriesService, useValue: { listMine: vi.fn().mockResolvedValue([trainingEntry]) } },
      { provide: RecoveryPausesService, useValue: { listMine: listPauses } },
      { provide: SessionRecordsService, useValue: { listMine: vi.fn().mockResolvedValue([]) } },
      { provide: MatDialog, useValue: { open: vi.fn() } },
    ],
  });
  return TestBed.inject(TrainingLogPageComponent);
}
