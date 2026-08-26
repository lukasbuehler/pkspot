import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaType } from "../../../db/models/Interfaces";
import {
  MediaUploadDialogComponent,
  MediaUploadDialogData,
} from "./media-upload-dialog.component";
import { MediaUploadStatusService } from "../../services/firebase/firestore/media-upload-status.service";
import { StorageService } from "../../services/firebase/storage.service";
import { MediaUpload } from "../media-upload/media-upload.component";

describe("MediaUploadDialogComponent", () => {
  let snackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    disableClose: boolean;
  };
  let mediaUploadStatusService: {
    trackLocalUpload: ReturnType<typeof vi.fn>;
  };
  let data: MediaUploadDialogData;

  beforeEach(() => {
    snackBar = {
      open: vi.fn(),
    };
    dialogRef = {
      close: vi.fn(),
      disableClose: false,
    };
    mediaUploadStatusService = {
      trackLocalUpload: vi.fn(),
    };
    data = {
      spotId: "spot-1",
      currentMedia: [
        {
          src: "https://storage.example/old.jpg",
          type: MediaType.Image,
          isInStorage: true,
        },
      ],
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MediaUploadStatusService, useValue: mediaUploadStatusService },
        { provide: StorageService, useValue: {} },
      ],
    });
  });

  function createComponent(): MediaUploadDialogComponent {
    return TestBed.runInInjectionContext(
      () =>
        new MediaUploadDialogComponent(
          data,
          dialogRef as unknown as MatDialogRef<MediaUploadDialogComponent>
        )
    );
  }

  it("tells the user uploaded media is queued for moderation", async () => {
    const component = createComponent();

    await component.onMediaBatchUploaded([
      {
        src: "https://storage.example/new.jpg",
        is_sized: true,
        type: MediaType.Image,
        uploadId: "upload-1",
        previewSrc: "blob:preview",
      },
      {
        src: "https://storage.example/clip.mp4",
        is_sized: false,
        type: MediaType.Video,
      },
    ]);

    expect(data.currentMedia).toHaveLength(1);
    expect(mediaUploadStatusService.trackLocalUpload).toHaveBeenCalledWith({
      uploadId: "upload-1",
      targetKind: "spot",
      targetId: "spot-1",
      type: MediaType.Image,
      publicUrl: "https://storage.example/new.jpg",
      previewSrc: "blob:preview",
    });
    expect(snackBar.open).toHaveBeenCalledWith(
      "Media received. It will appear when processing finishes.",
      "Dismiss",
      {
        duration: 4000,
        horizontalPosition: "center",
        verticalPosition: "bottom",
      }
    );
  });

  it("uploads staged media instead of letting Done discard it", async () => {
    const fixture = TestBed.createComponent(MediaUploadDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const mediaUpload = fixture.debugElement.query(
      By.directive(MediaUpload),
    ).componentInstance as MediaUpload;
    mediaUpload.mediaList.set([
      {
        id: "staged-1",
        originalFile: new File(["image"], "spot.jpg", { type: "image/jpeg" }),
        file: new File(["image"], "spot.jpg", { type: "image/jpeg" }),
        originalPreviewSrc: "blob:preview",
        previewSrc: "blob:preview",
        icon: "image",
        uploadProgress: 0,
        type: MediaType.Image,
        state: "staged",
        isCropped: true,
      },
    ]);
    const uploadStaged = vi
      .spyOn(mediaUpload, "uploadStaged")
      .mockResolvedValue(undefined);
    fixture.detectChanges();
    component.onMediaChanged();

    component.confirm();

    expect(uploadStaged).toHaveBeenCalledOnce();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(dialogRef.disableClose).toBe(true);
  });

  it("closes only when no media remains to upload", () => {
    const fixture = TestBed.createComponent(MediaUploadDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.confirm();

    expect(dialogRef.close).toHaveBeenCalledOnce();
  });
});
