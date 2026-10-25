import { AnalyticsService } from "../../analytics.service";
import { TestBed } from "@angular/core/testing";
import { BehaviorSubject, of } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { MediaType } from "../../../../db/models/Interfaces";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { MediaUploadStatusService } from "./media-upload-status.service";

describe("MediaUploadStatusService", () => {
  const trackEvent = vi.fn();
  let service: MediaUploadStatusService;
  let collectionSnapshots: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    trackEvent.mockReset();
    collectionSnapshots = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      providers: [
        MediaUploadStatusService,
        { provide: AnalyticsService, useValue: { trackEvent, reportError: vi.fn() } },
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "user-1" },
            authState$: new BehaviorSubject({ uid: "user-1" }),
          },
        },
        {
          provide: FirestoreAdapterService,
          useValue: {
            collectionSnapshots,
          },
        },
      ],
    });

    service = TestBed.inject(MediaUploadStatusService);
  });

  it.each(["published", "failed"])("records a local processing transition to %s only once", (status) => {
    const statuses = new BehaviorSubject<unknown[]>([]);
    collectionSnapshots.mockReturnValue(statuses);
    service.trackLocalUpload({ uploadId: "private-id", targetKind: "spot", type: MediaType.Image, publicUrl: "private-url" });
    service.watchTarget("spot");
    const update = [{ id: "status", upload_id: "private-id", status }];
    statuses.next(update); statuses.next(update);
    expect(trackEvent.mock.calls.filter(call => call[0] === (status === "published" ? "feature_action_succeeded" : "feature_action_failed"))).toHaveLength(1);
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("private-id");
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain("private-url");
  });

  it("hides a local processing upload once the spot already contains its published media URL", () => {
    service.trackLocalUpload({
      uploadId: "upload-1",
      targetKind: "spot",
      targetId: "spot-1",
      type: MediaType.Image,
      publicUrl: "https://storage.example/spot_pictures%2Fpublished.jpg?alt=media",
      previewSrc: "blob:preview",
    });

    expect(service.processingMediaForTarget("spot", "spot-1")).toHaveLength(1);

    expect(
      service.processingMediaForTarget("spot", "spot-1", [
        "https://storage.example/spot_pictures%2Fpublished.jpg?alt=media",
      ]),
    ).toEqual([]);
  });

  it("waits for the server to publish an upload before returning its URL", async () => {
    collectionSnapshots.mockReturnValue(
      of(
        [],
        [
          {
            id: "upload-1",
            uid: "user-1",
            upload_id: "upload-1",
            status: "processing",
            created_at: {},
            updated_at: {},
          },
        ],
        [
          {
            id: "upload-1",
            uid: "user-1",
            upload_id: "upload-1",
            status: "published",
            public_url: "https://storage.example/organization_media/logo.png",
            created_at: {},
            updated_at: {},
          },
        ],
      ),
    );

    await expect(service.waitForPublishedUpload("upload-1")).resolves.toBe(
      "https://storage.example/organization_media/logo.png",
    );
    expect(collectionSnapshots).toHaveBeenCalledWith(
      "media_upload_status",
      [
        { fieldPath: "uid", opStr: "==", value: "user-1" },
        { fieldPath: "upload_id", opStr: "==", value: "upload-1" },
      ],
      [{ type: "limit", limit: 1 }],
    );
  });

  it("rejects an upload that server-side processing marks as failed", async () => {
    collectionSnapshots.mockReturnValue(
      of([
        {
          id: "upload-1",
          uid: "user-1",
          upload_id: "upload-1",
          status: "failed",
          created_at: {},
          updated_at: {},
        },
      ]),
    );

    await expect(service.waitForPublishedUpload("upload-1")).rejects.toThrow(
      "Media processing failed.",
    );
  });
});
