import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "./authentication.service";
import { FunctionsAdapterService } from "./functions-adapter.service";
import { StorageAdapterService } from "./storage-adapter.service";
import { StorageService } from "./storage.service";

describe("StorageService Spot media submissions", () => {
  // Both callables enforce App Check, and native `call()` sends no token.
  const functions = {
    call: vi.fn(),
    callAuthenticatedAppChecked: vi.fn().mockResolvedValue({}),
  };
  let service: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: FunctionsAdapterService, useValue: functions },
        { provide: StorageAdapterService, useValue: {} },
        { provide: AuthenticationService, useValue: {} },
      ],
    });
    service = TestBed.inject(StorageService);
  });

  it("begins a submission with App Check", async () => {
    await service.beginSpotMediaSubmission("spot-1", ["upload-1"]);

    expect(functions.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "beginSpotMediaSubmission",
      expect.objectContaining({ spot_id: "spot-1", upload_ids: ["upload-1"] }),
    );
    expect(functions.call).not.toHaveBeenCalled();
  });

  it("reports failed uploads with App Check", async () => {
    await service.failSpotMediaSubmissionUploads(["upload-1"]);

    expect(functions.callAuthenticatedAppChecked).toHaveBeenCalledWith(
      "failSpotMediaSubmissionUploads",
      { upload_ids: ["upload-1"] },
    );
    expect(functions.call).not.toHaveBeenCalled();
  });
});
