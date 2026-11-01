import { TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { FeatureTelemetryService } from "../../feature-telemetry.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { SessionRecordsService } from "./session-records.service";
import { TrainingSummaryService } from "./training-summary.service";

describe("TrainingSummaryService ranks", () => {
  function setup(documents: unknown[]) {
    const firestore = {
      getCollection: vi.fn().mockResolvedValue(documents),
      getDocument: vi.fn().mockResolvedValue(documents[0] ?? null),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: FirestoreAdapterService, useValue: firestore },
        { provide: AuthenticationService, useValue: { user: { uid: "user-1" } } },
        { provide: FeatureTelemetryService, useValue: {} },
        { provide: FunctionsAdapterService, useValue: {} },
        { provide: SessionRecordsService, useValue: {} },
      ],
    });
    return TestBed.inject(TrainingSummaryService);
  }

  it("gives a rank document without a spots map an empty one", async () => {
    // A nightly withdrawal can create the month document with only metadata.
    const withoutSpots = { version: 1, month: "2026-10", final: false, computed_at_raw_ms: 1 };
    const service = setup([withoutSpots]);
    expect(await service.listMyRanks()).toEqual([{ ...withoutSpots, spots: {} }]);
    expect((await service.getMyRanks("2026-10"))?.spots).toEqual({});
  });
});
