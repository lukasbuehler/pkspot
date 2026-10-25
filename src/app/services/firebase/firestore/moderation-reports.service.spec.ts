import { TestBed } from "@angular/core/testing";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { SearchService } from "../../search.service";
import { ModerationReportsService } from "./moderation-reports.service";

describe("ModerationReportsService media review links", () => {
  const firestore = {
    getCollectionGroupWithMetadata: vi.fn(),
    getCollection: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      { provide: FirestoreAdapterService, useValue: firestore },
      { provide: FunctionsAdapterService, useValue: {} },
      { provide: SearchService, useValue: {} },
    ] });
  });

  it.each([
    ["media_upload_reviews/old-review", "old-review"],
    ["media_upload_reviews/audit_123", "audit_123"],
    ["users/someone", undefined],
    [undefined, undefined],
  ])("maps %s without needing a public media target", async (reviewPath, expectedId) => {
    firestore.getCollectionGroupWithMetadata.mockResolvedValue({ data: [{
      id: "scanner_old-review", path: "reports/scanner_old-review",
      kind: "media", source: "scanner", review_path: reviewPath,
      media: { type: "image", storage_path: "media_intake/uploader/old-review/image.jpg" },
      user: { uid: "system_media_scanner" },
      createdAt: new Date(), reason: "explicit_non_child",
    }] });
    const [report] = await TestBed.inject(ModerationReportsService).getReports();
    expect(report.mediaReviewId).toBe(expectedId);
    expect(report.targetPath).toBeUndefined();
  });
});
