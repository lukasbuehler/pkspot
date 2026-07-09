import { TestBed } from "@angular/core/testing";
import { BehaviorSubject, of } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";
import { MediaType } from "../../../../db/models/Interfaces";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { MediaUploadStatusService } from "./media-upload-status.service";

describe("MediaUploadStatusService", () => {
  let service: MediaUploadStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MediaUploadStatusService,
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
            collectionSnapshots: () => of([]),
          },
        },
      ],
    });

    service = TestBed.inject(MediaUploadStatusService);
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
});
