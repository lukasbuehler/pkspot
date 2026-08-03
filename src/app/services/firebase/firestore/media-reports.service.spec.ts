import { TestBed } from "@angular/core/testing";
import { ExternalImage } from "../../../../db/models/Media";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { MediaReportsService } from "./media-reports.service";

describe("MediaReportsService", () => {
  const callPublic = vi.fn();
  let service: MediaReportsService;

  beforeEach(() => {
    callPublic.mockReset();
    callPublic.mockResolvedValue({ reportId: "report-1" });
    TestBed.configureTestingModule({
      providers: [
        MediaReportsService,
        {
          provide: FunctionsAdapterService,
          useValue: { callPublic },
        },
      ],
    });
    service = TestBed.inject(MediaReportsService);
  });

  it("submits guest reports through the server endpoint", async () => {
    const id = await service.submitMediaReport(
      new ExternalImage(
        "https://example.test/image.jpg",
        "uploader-1",
      ),
      "person did not consent",
      "Please remove this",
      "reporter@example.test",
      "en",
      "spot-1",
      "spot",
      "spot-1",
    );

    expect(id).toBe("report-1");
    expect(callPublic).toHaveBeenCalledWith("submitMediaReport", {
      media: {
        type: "image",
        src: "https://example.test/image.jpg",
        userId: "uploader-1",
        is_in_storage: false,
      },
      reason: "person did not consent",
      comment: "Please remove this",
      reporterEmail: "reporter@example.test",
      locale: "en",
      spotId: "spot-1",
      context: "spot",
      targetId: "spot-1",
    });
  });
});
