import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecoveryPauseDocument } from "../../../../db/schemas/RecoveryPauseSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import {
  RecoveryPausesService,
  validateRecoveryPause,
} from "./recovery-pauses.service";

describe("RecoveryPausesService", () => {
  const firestore = {
    addDocument: vi.fn(),
    deleteFieldValue: vi.fn(() => ({ __type__: "delete" })),
    deleteDocument: vi.fn(),
    getCollection: vi.fn(),
    updateDocument: vi.fn(),
  };
  const auth = { user: { uid: "recovery-owner" } };
  let service: RecoveryPausesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RecoveryPausesService,
        { provide: AuthenticationService, useValue: auth },
        { provide: FirestoreAdapterService, useValue: firestore },
      ],
    });
    service = TestBed.inject(RecoveryPausesService);
    vi.clearAllMocks();
    firestore.getCollection.mockResolvedValue([]);
    firestore.addDocument.mockResolvedValue("pause-1");
  });

  it("stores only owner-scoped, date-only recovery context", async () => {
    await expect(
      service.create({
        startedOn: "2026-08-03",
        endedOn: "2026-08-07",
        reason: "injury",
        note: "  Taking it slowly.  ",
      }),
    ).resolves.toBe("pause-1");

    expect(firestore.getCollection).toHaveBeenCalledWith(
      "users/recovery-owner/recovery_pauses",
      [],
      [
        { type: "orderBy", fieldPath: "started_on", direction: "desc" },
        { type: "limit", limit: 50 },
      ],
    );
    expect(firestore.addDocument).toHaveBeenCalledWith(
      "users/recovery-owner/recovery_pauses",
      expect.objectContaining({
        owner_id: "recovery-owner",
        started_on: "2026-08-03",
        ended_on: "2026-08-07",
        reason: "injury",
        note: "Taking it slowly.",
      }),
    );
    expect(JSON.stringify(firestore.addDocument.mock.calls[0][1])).not.toContain(
      "spot",
    );
  });

  it("rejects future, inverted, and overlapping recovery periods before writing", async () => {
    const existing = {
      id: "existing-pause",
      owner_id: "recovery-owner",
      started_on: "2026-08-03",
      ended_on: "2026-08-07",
      reason: "injury",
    } as RecoveryPauseDocument;
    firestore.getCollection.mockResolvedValue([existing]);

    await expect(
      service.create({
        startedOn: "2026-08-05",
        reason: "illness",
      }),
    ).rejects.toThrow("cannot overlap");
    expect(
      validateRecoveryPause(
        { startedOn: "2026-08-10", endedOn: "2026-08-09", reason: "other" },
        [],
        undefined,
        new Date("2026-08-20T12:00:00"),
      ),
    ).toContain("after the start date");
    expect(
      validateRecoveryPause(
        { startedOn: "2026-08-21", reason: "other" },
        [],
        undefined,
        new Date("2026-08-20T12:00:00"),
      ),
    ).toContain("cannot be in the future");
    expect(firestore.addDocument).not.toHaveBeenCalled();
  });

  it("removes optional fields through the adapter when a pause is closed without a note", async () => {
    await service.update("pause-1", {
      startedOn: "2026-08-03",
      endedOn: "2026-08-07",
      reason: "injury",
    });

    expect(firestore.updateDocument).toHaveBeenCalledWith(
      "users/recovery-owner/recovery_pauses/pause-1",
      expect.objectContaining({
        started_on: "2026-08-03",
        ended_on: "2026-08-07",
        note: { __type__: "delete" },
      }),
    );
  });
});
