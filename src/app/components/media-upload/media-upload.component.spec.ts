import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaType } from "../../../db/models/Interfaces";
import { StorageBucket } from "../../../db/schemas/Media";
import { StorageService } from "../../services/firebase/storage.service";
import { MediaUpload } from "./media-upload.component";

describe("MediaUpload", () => {
  let storageService: {
    setUploadToStorageWithResult: ReturnType<typeof vi.fn>;
  };
  let snackBar: {
    open: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storageService = {
      setUploadToStorageWithResult: vi.fn(),
    };
    snackBar = {
      open: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [MediaUpload],
      providers: [
        { provide: StorageService, useValue: storageService },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview"),
    });
  });

  function createComponent(): MediaUpload {
    return TestBed.runInInjectionContext(() => new MediaUpload());
  }

  async function createFixture(): Promise<ComponentFixture<MediaUpload>> {
    await TestBed.compileComponents();
    return TestBed.createComponent(MediaUpload);
  }

  function inputWithFiles(files: File[]): EventTarget {
    return {
      files: {
        length: files.length,
        item: (index: number) => files[index] ?? null,
        ...files,
      },
    } as unknown as EventTarget;
  }

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it("marks the attach button as non-submit so parent edit forms stay open", async () => {
    const fixture = await createFixture();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      "#attachMedia",
    ) as HTMLButtonElement | null;

    expect(button?.type).toBe("button");
  });

  it("uploads selected spot images to storage and emits individual and batch media", async () => {
    const component = createComponent();
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    const mediaEvents: { src: string; is_sized: boolean; type: MediaType }[] =
      [];
    const batchEvents: { src: string; is_sized: boolean; type: MediaType }[][] =
      [];
    const uploadingEvents: boolean[] = [];

    component.storageFolder = StorageBucket.SpotPictures;
    component.allowedMimeTypes = ["image/jpeg"];
    component.newMedia.subscribe((event) => mediaEvents.push(event));
    component.mediaBatchUploaded.subscribe((event) => batchEvents.push(event));
    component.isUploading.subscribe((event) => uploadingEvents.push(event));
    storageService.setUploadToStorageWithResult.mockImplementation(
      async (
        _file: File,
        _bucket: StorageBucket,
        onProgress?: (progress: number) => void
      ) => {
        await Promise.resolve();
        onProgress?.(42);
        return {
          url: "https://storage.example/spot_pictures%2Fspot.jpg?alt=media",
          uploadId: "upload-1",
          path: "spot_pictures/spot.jpg",
          targetKind: "spot",
        };
      }
    );

    component.onSelectFiles(inputWithFiles([file]));
    await flushPromises();

    expect(storageService.setUploadToStorageWithResult).toHaveBeenCalledWith(
      file,
      StorageBucket.SpotPictures,
      expect.any(Function),
      expect.any(String),
      "jpg",
      "public, max-age=31536000",
      undefined,
      undefined
    );
    expect(component.mediaList()[0]?.uploadProgress).toBe(100);
    expect(mediaEvents).toEqual([
      {
        src: "https://storage.example/spot_pictures%2Fspot.jpg?alt=media",
        is_sized: true,
        type: MediaType.Image,
        uploadId: "upload-1",
        previewSrc: "blob:preview",
        targetKind: "spot",
        targetId: undefined,
      },
    ]);
    expect(batchEvents).toEqual([mediaEvents]);
    expect(uploadingEvents).toEqual([true, false]);
  });

  it("emits selected files without entering upload state when storage upload is disabled", () => {
    const component = createComponent();
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const selectedFiles: File[] = [];
    const uploadingEvents: boolean[] = [];

    component.uploadToStorage = false;
    component.allowedMimeTypes = ["video/mp4"];
    component.fileSelected.subscribe((event) => selectedFiles.push(event));
    component.isUploading.subscribe((event) => uploadingEvents.push(event));

    component.onSelectFiles(inputWithFiles([file]));

    expect(selectedFiles).toEqual([file]);
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()[0]?.uploadProgress).toBe(100);
    expect(uploadingEvents).toEqual([]);
  });

  it("rejects invalid mime types before starting upload state", () => {
    const component = createComponent();
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    const uploadingEvents: boolean[] = [];

    component.storageFolder = StorageBucket.SpotPictures;
    component.allowedMimeTypes = ["image/png"];
    component.isUploading.subscribe((event) => uploadingEvents.push(event));

    component.onSelectFiles(inputWithFiles([file]));

    expect(component.hasError).toBe(true);
    expect(component.errorMessage).toBe("The type of this file is not allowed");
    expect(snackBar.open).toHaveBeenCalledWith("File mimetype is not allowed!");
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()).toEqual([]);
    expect(uploadingEvents).toEqual([]);
  });

  it("rejects oversized files before starting upload state", () => {
    const component = createComponent();
    const file = new File(["too large"], "spot.png", { type: "image/png" });
    const uploadingEvents: boolean[] = [];

    component.storageFolder = StorageBucket.SpotPictures;
    component.allowedMimeTypes = ["image/png"];
    component.maximumSizeInBytes = 1;
    component.isUploading.subscribe((event) => uploadingEvents.push(event));

    component.onSelectFiles(inputWithFiles([file]));

    expect(component.hasError).toBe(true);
    expect(component.errorMessage).toContain("too big");
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()).toEqual([]);
    expect(uploadingEvents).toEqual([]);
  });

  it("clears upload state and shows feedback when storage upload fails", async () => {
    const component = createComponent();
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    const uploadingEvents: boolean[] = [];

    component.storageFolder = StorageBucket.SpotPictures;
    component.allowedMimeTypes = ["image/jpeg"];
    component.isUploading.subscribe((event) => uploadingEvents.push(event));
    storageService.setUploadToStorageWithResult.mockRejectedValue(
      new Error("storage denied")
    );

    component.onSelectFiles(inputWithFiles([file]));
    await flushPromises();

    expect(snackBar.open).toHaveBeenCalledWith("Error uploading media!", "OK", {
      duration: 5000,
    });
    expect(component.mediaList()[0]?.uploadProgress).toBe(0);
    expect(uploadingEvents).toEqual([true, false]);
  });
});
