import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { ModerationMediaService } from "./moderation-media.service";

describe("ModerationMediaService", () => {
  const firestore = {
    getCollection: vi.fn(),
  };
  let service: ModerationMediaService;

  beforeEach(() => {
    firestore.getCollection.mockReset();
    TestBed.configureTestingModule({
      providers: [
        ModerationMediaService,
        { provide: FirestoreAdapterService, useValue: firestore },
      ],
    });
    service = TestBed.inject(ModerationMediaService);
  });

  it("shows approved media and keeps flagged uploads without a public preview", async () => {
    firestore.getCollection.mockResolvedValue([
      {
        id: "approved",
        status: "approved",
        uid: "uploader",
        approved_path: "spots/spot-1/image.jpg",
        approved_url: "https://storage.example/image.jpg",
        content_type: "image/jpeg",
        completed_at: { seconds: 20 },
        scan_result: {
          provider: "google-cloud-vision-safe-search",
          provider_version: "v1",
          decision: "allow",
          severity: "none",
        },
      },
      {
        id: "flagged",
        status: "needs_review",
        intake_path: "media-intake/upload/image.jpg",
        content_type: "image/jpeg",
        completed_at: { seconds: 10 },
        scan_result: {
          provider: "google-cloud-vision-safe-search",
          provider_version: "v1",
          decision: "needs_review",
          severity: "explicit_non_child",
        },
      },
    ]);

    const result = await service.getUploadStream();

    expect(result).toEqual([
      expect.objectContaining({
        id: "approved",
        isApproved: true,
        publicUrl: "https://storage.example/image.jpg",
        uploaderUid: "uploader",
      }),
      expect.objectContaining({
        id: "flagged",
        isApproved: false,
        publicUrl: undefined,
        storagePath: "media-intake/upload/image.jpg",
      }),
    ]);
  });
});
