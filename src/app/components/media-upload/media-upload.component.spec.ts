import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatDialog } from "@angular/material/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { of } from "rxjs";
import { MediaType } from "../../../db/models/Interfaces";
import { StorageBucket } from "../../../db/schemas/Media";
import { StorageService } from "../../services/firebase/storage.service";
import { MediaUpload } from "./media-upload.component";
import {
  OPTIONAL_MEDIA_CROP_POLICY,
  SQUARE_ICON_CROP_POLICY,
} from "../crop-image/image-crop-policy";

describe("MediaUpload", () => {
  let storageService: {
    setUploadToStorageWithResult: ReturnType<typeof vi.fn>;
  };
  let snackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let dialog: {
    open: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storageService = {
      setUploadToStorageWithResult: vi.fn(),
    };
    snackBar = {
      open: vi.fn(),
    };
    dialog = {
      open: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [MediaUpload],
      providers: [
        { provide: StorageService, useValue: storageService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    TestBed.overrideComponent(MediaUpload, {
      add: {
        providers: [
          { provide: StorageService, useValue: storageService },
          { provide: MatSnackBar, useValue: snackBar },
          { provide: MatDialog, useValue: dialog },
        ],
      },
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

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

  it("stages selected spot images and uploads only after confirmation", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    const mediaEvents: { src: string; is_sized: boolean; type: MediaType }[] =
      [];
    const batchEvents: { src: string; is_sized: boolean; type: MediaType }[][] =
      [];
    const uploadingEvents: boolean[] = [];

    fixture.componentRef.setInput("storageFolder", StorageBucket.SpotPictures);
    fixture.componentRef.setInput("allowedMimeTypes", ["image/jpeg"]);
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
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()[0]?.state).toBe("staged");

    await component.uploadStaged();
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

  it("emits selected files only after confirming a local-only upload", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const file = new File(["video"], "clip.mp4", { type: "video/mp4" });
    const selectedFiles: File[] = [];
    const uploadingEvents: boolean[] = [];

    fixture.componentRef.setInput("uploadToStorage", false);
    fixture.componentRef.setInput("allowedMimeTypes", ["video/mp4"]);
    component.fileSelected.subscribe((event) => selectedFiles.push(event));
    component.isUploading.subscribe((event) => uploadingEvents.push(event));

    component.onSelectFiles(inputWithFiles([file]));
    expect(selectedFiles).toEqual([]);
    await component.uploadStaged();

    expect(selectedFiles).toEqual([file]);
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()[0]?.uploadProgress).toBe(100);
    expect(uploadingEvents).toEqual([true, false]);
  });

  it("rejects invalid mime types before starting upload state", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    const uploadingEvents: boolean[] = [];

    fixture.componentRef.setInput("storageFolder", StorageBucket.SpotPictures);
    fixture.componentRef.setInput("allowedMimeTypes", ["image/png"]);
    component.isUploading.subscribe((event) => uploadingEvents.push(event));

    component.onSelectFiles(inputWithFiles([file]));

    expect(component.hasError).toBe(true);
    expect(component.errorMessage).toBe(
      "The type of this file is not allowed.",
    );
    expect(snackBar.open).toHaveBeenCalledWith(
      "The type of this file is not allowed.",
      "Dismiss",
      { duration: 5000 },
    );
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()).toEqual([]);
    expect(uploadingEvents).toEqual([]);
  });

  it("rejects oversized files before starting upload state", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const file = new File(["too large"], "spot.png", { type: "image/png" });
    const uploadingEvents: boolean[] = [];

    fixture.componentRef.setInput("storageFolder", StorageBucket.SpotPictures);
    fixture.componentRef.setInput("allowedMimeTypes", ["image/png"]);
    fixture.componentRef.setInput("maximumSizeInBytes", 1);
    component.isUploading.subscribe((event) => uploadingEvents.push(event));

    component.onSelectFiles(inputWithFiles([file]));

    expect(component.hasError).toBe(true);
    expect(component.errorMessage).toContain("too big");
    expect(storageService.setUploadToStorageWithResult).not.toHaveBeenCalled();
    expect(component.mediaList()).toEqual([]);
    expect(uploadingEvents).toEqual([]);
  });

  it("opens required square crops immediately but leaves optional images staged", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const original = new File(["original"], "logo.jpg", {
      type: "image/jpeg",
    });
    const cropped = new File(["cropped"], "logo-cropped.jpg", {
      type: "image/jpeg",
    });
    dialog.open.mockReturnValue({ afterClosed: () => of(cropped) });

    fixture.componentRef.setInput("imageCropPolicy", SQUARE_ICON_CROP_POLICY);
    component.onSelectFiles(inputWithFiles([original]));
    await flushPromises();

    expect(dialog.open).toHaveBeenCalled();
    expect(component.mediaList()[0]).toMatchObject({
      originalFile: original,
      file: cropped,
      isCropped: true,
      state: "staged",
    });

    component.clear();
    dialog.open.mockClear();
    fixture.componentRef.setInput("imageCropPolicy", OPTIONAL_MEDIA_CROP_POLICY);
    component.onSelectFiles(inputWithFiles([original]));

    expect(dialog.open).not.toHaveBeenCalled();
    expect(component.mediaList()[0]).toMatchObject({
      file: original,
      isCropped: false,
      state: "staged",
    });
  });

  it("clears upload state and shows feedback when storage upload fails", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    const uploadingEvents: boolean[] = [];

    fixture.componentRef.setInput("storageFolder", StorageBucket.SpotPictures);
    fixture.componentRef.setInput("allowedMimeTypes", ["image/jpeg"]);
    component.isUploading.subscribe((event) => uploadingEvents.push(event));
    storageService.setUploadToStorageWithResult.mockRejectedValue(
      new Error("storage denied")
    );

    component.onSelectFiles(inputWithFiles([file]));
    await component.uploadStaged();
    await flushPromises();

    expect(snackBar.open).toHaveBeenCalledWith(
      "Error uploading media. Try again.",
      "Dismiss",
      {
        duration: 5000,
      },
    );
    expect(component.mediaList()[0]?.uploadProgress).toBe(0);
    expect(component.mediaList()[0]?.state).toBe("failed");
    expect(uploadingEvents).toEqual([true, false]);
  });

  it("re-crops optional images and can revert to the original", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const original = new File(["original"], "spot.png", { type: "image/png" });
    const cropped = new File(["cropped"], "spot-cropped.png", {
      type: "image/png",
    });
    fixture.componentRef.setInput("imageCropPolicy", OPTIONAL_MEDIA_CROP_POLICY);
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:original")
      .mockReturnValueOnce("blob:cropped");
    dialog.open.mockReturnValue({ afterClosed: () => of(cropped) });
    component.onSelectFiles(inputWithFiles([original]));
    const id = component.mediaList()[0]!.id;

    await component.editImage(id);
    expect(component.mediaList()[0]).toMatchObject({
      file: cropped,
      isCropped: true,
    });

    component.revertCrop(id);
    expect(component.mediaList()[0]).toMatchObject({
      file: original,
      isCropped: false,
      previewSrc: "blob:original",
    });
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("stages mixed GIF, SVG, and video batches without opening the cropper", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const files = [
      new File(["gif"], "animated.gif", { type: "image/gif" }),
      new File(["svg"], "logo.svg", { type: "image/svg+xml" }),
      new File(["video"], "clip.mp4", { type: "video/mp4" }),
    ];
    fixture.componentRef.setInput("multipleAllowed", true);
    fixture.componentRef.setInput("allowedMimeTypes", [
      "image/gif",
      "image/svg+xml",
      "video/mp4",
    ]);
    fixture.componentRef.setInput("imageCropPolicy", OPTIONAL_MEDIA_CROP_POLICY);

    component.onSelectFiles(inputWithFiles(files));

    expect(component.mediaList()).toHaveLength(3);
    expect(component.mediaList().map((item) => item.state)).toEqual([
      "staged",
      "staged",
      "staged",
    ]);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it("retries failed uploads and ignores a cancelled in-flight result", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const file = new File(["image"], "spot.jpg", { type: "image/jpeg" });
    fixture.componentRef.setInput("storageFolder", StorageBucket.SpotPictures);
    fixture.componentRef.setInput("allowedMimeTypes", ["image/jpeg"]);
    storageService.setUploadToStorageWithResult.mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    component.onSelectFiles(inputWithFiles([file]));

    await component.uploadStaged();
    expect(component.mediaList()[0]?.state).toBe("failed");

    storageService.setUploadToStorageWithResult.mockResolvedValueOnce({
      url: "https://storage.example/spot_pictures%2Fretry.jpg?alt=media",
      path: "spot_pictures/retry.jpg",
    });
    await component.uploadStaged();
    expect(component.mediaList()[0]?.state).toBe("complete");

    component.clear();
    component.onSelectFiles(inputWithFiles([file]));
    let resolveUpload!: (value: {
      url: string;
      path: string;
    }) => void;
    storageService.setUploadToStorageWithResult.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const upload = component.uploadStaged();
    component.cancelBatch();
    resolveUpload({
      url: "https://storage.example/ignored.jpg",
      path: "spot_pictures/ignored.jpg",
    });
    await upload;

    expect(component.mediaList()).toEqual([]);
  });

  it("revokes previews on removal and destruction", async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    const first = new File(["one"], "one.png", { type: "image/png" });
    const second = new File(["two"], "two.png", { type: "image/png" });
    fixture.componentRef.setInput("multipleAllowed", true);
    component.onSelectFiles(inputWithFiles([first, second]));

    component.removeMedia(component.mediaList()[0]!.id);
    fixture.destroy();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
