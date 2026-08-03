import { TestBed } from "@angular/core/testing";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { ImportsService } from "./imports.service";

describe("ImportsService public provenance", () => {
  it("treats unavailable optional provenance as absent and caches the result", async () => {
    const functions = {
      callPublic: vi.fn().mockRejectedValue(new Error("internal")),
    };
    TestBed.configureTestingModule({
      providers: [
        ImportsService,
        { provide: FirestoreAdapterService, useValue: {} },
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    const service = TestBed.inject(ImportsService);

    await expect(service.getPublicProvenanceById("import-1")).resolves.toBeNull();
    await expect(service.getPublicProvenanceById("import-1")).resolves.toBeNull();

    expect(functions.callPublic).toHaveBeenCalledOnce();
    expect(functions.callPublic).toHaveBeenCalledWith(
      "getPublicImportProvenance",
      { importId: "import-1" },
    );
  });
});
