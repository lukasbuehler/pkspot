import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "./authentication.service";
import { FunctionsAdapterService } from "./functions-adapter.service";
import { StorageAdapterService } from "./storage-adapter.service";
import { StorageService } from "./storage.service";
import sharp from "sharp";
import { StorageBucket } from "../../../db/schemas/Media";
import { hasPrivateImageMetadata } from "../../../db/utils/image-metadata";

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

describe("StorageService photo uploads", () => {
  const storageAdapter = {
    uploadFile: vi.fn().mockResolvedValue("https://example.test/file"),
    buildPublicUrl: vi.fn((path: string) => `https://example.test/${path}`),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: FunctionsAdapterService, useValue: {} },
        { provide: StorageAdapterService, useValue: storageAdapter },
        {
          provide: AuthenticationService,
          useValue: { isSignedIn: true, user: { uid: "user-1" } },
        },
      ],
    });
  });

  function readBlob(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  async function uploadedBytes(location: StorageBucket, blob: Blob): Promise<Uint8Array> {
    await TestBed.inject(StorageService).setUploadToStorageWithResult(blob, location);
    const sent = storageAdapter.uploadFile.mock.calls[0][0].data as Blob;
    return readBlob(sent);
  }

  async function photoWithLocation(): Promise<Blob> {
    const bytes = await sharp({
      create: { width: 12, height: 8, channels: 3, background: "#30a050" },
    })
      .withExif({
        IFD0: { Make: "PhoneMaker" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "47/1 22/1 3684/100" },
      })
      .jpeg()
      .toBuffer();
    return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
  }

  for (const location of [
    StorageBucket.SpotPictures,
    StorageBucket.ProfilePictures,
    StorageBucket.EventMedia,
  ]) {
    it(`strips photo locations before uploading to ${location}`, async () => {
      const photo = await photoWithLocation();
      expect(hasPrivateImageMetadata(await readBlob(photo))).toBe(true);

      const sent = await uploadedBytes(location, photo);

      expect(hasPrivateImageMetadata(sent)).toBe(false);
      expect((await sharp(sent).metadata()).format).toBe("jpeg");
    });
  }

  it("uploads videos unchanged", async () => {
    const video = new Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], {
      type: "video/mp4",
    });

    const sent = await uploadedBytes(StorageBucket.SpotPictures, video);

    expect(Array.from(sent)).toEqual([0, 0, 0, 24, 102, 116, 121, 112]);
  });
});
