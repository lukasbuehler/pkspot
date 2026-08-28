import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmCheckInRequest } from "../../../../db/schemas/CheckInActivitySchema";
import type { SessionRecordDocument } from "../../../../db/schemas/SessionRecordSchema";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { SessionRecordsService } from "./session-records.service";

describe("SessionRecordsService check-ins", () => {
  const firestore = { getCollection: vi.fn() };
  const functions = { callAuthenticatedAppChecked: vi.fn() };
  const auth = { user: { uid: "check-in-owner" } };
  let service: SessionRecordsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SessionRecordsService,
        { provide: AuthenticationService, useValue: auth },
        { provide: FirestoreAdapterService, useValue: firestore },
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    service = TestBed.inject(SessionRecordsService);
    firestore.getCollection.mockReset();
    functions.callAuthenticatedAppChecked.mockReset();
  });

  it("uses the App-Check callable for explicit confirmation", async () => {
    const input: ConfirmCheckInRequest = {
      spotId: "spot-1",
      location: { lat: 47.3769, lng: 8.5417 },
      accuracyMeters: 12,
      timeZone: "Europe/Zurich",
    };
    functions.callAuthenticatedAppChecked.mockResolvedValue({
      checkInId: "opaque-id",
      sessionRecordId: "session-1",
      duplicate: false,
    });

    await expect(service.confirmCheckIn(input)).resolves.toMatchObject({
      checkInId: "opaque-id",
    });
    expect(functions.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "confirmCheckIn",
      input,
    );
  });

  it("lists and exports only server-confirmed check-in occurrences", async () => {
    firestore.getCollection.mockResolvedValue([
      {
        id: "check-in-session",
        source: "check_in",
        spot_visits: [
          {
            check_in_id: "opaque-first",
            spot_id: "spot-1",
            spot_name: "Dame du Lac",
            arrived_at_raw_ms: 1_000,
          },
          { spot_id: "manual-spot", arrived_at_raw_ms: 2_000 },
        ],
      },
      {
        id: "check-in-session-2",
        source: "check_in",
        spot_visits: [
          {
            check_in_id: "opaque-second",
            spot_id: "spot-2",
            arrived_at_raw_ms: 3_000,
          },
        ],
      },
    ] as unknown as SessionRecordDocument[]);

    await expect(service.listCheckIns()).resolves.toEqual([
      {
        checkInId: "opaque-second",
        sessionRecordId: "check-in-session-2",
        spotId: "spot-2",
        arrivedAtRawMs: 3_000,
      },
      {
        checkInId: "opaque-first",
        sessionRecordId: "check-in-session",
        spotId: "spot-1",
        spotName: "Dame du Lac",
        arrivedAtRawMs: 1_000,
      },
    ]);

    const exported = JSON.parse(await service.exportCheckIns()) as {
      check_ins: Array<Record<string, unknown>>;
    };
    expect(exported.check_ins).toEqual([
      { spot_id: "spot-2", checked_in_at: "1970-01-01T00:00:03.000Z" },
      {
        spot_id: "spot-1",
        spot_name: "Dame du Lac",
        checked_in_at: "1970-01-01T00:00:01.000Z",
      },
    ]);
    expect(JSON.stringify(exported)).not.toContain("location");
  });

  it("uses server-owned deletion endpoints for individual and bulk deletion", async () => {
    functions.callAuthenticatedAppChecked.mockResolvedValue({ deleted: 1 });

    await service.deleteCheckIn("opaque-id");
    await service.deleteAllCheckIns();

    expect(functions.callAuthenticatedAppChecked).toHaveBeenNthCalledWith(
      1,
      "deleteCheckIn",
      { checkInId: "opaque-id" },
    );
    expect(functions.callAuthenticatedAppChecked).toHaveBeenNthCalledWith(
      2,
      "deleteAllCheckIns",
      {},
    );
  });
});
