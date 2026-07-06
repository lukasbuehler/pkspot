import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaType } from "../../../db/models/Interfaces";
import {
  MediaUploadDialogComponent,
  MediaUploadDialogData,
} from "./media-upload-dialog.component";

describe("MediaUploadDialogComponent", () => {
  let snackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    disableClose: boolean;
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
      },
      {
        src: "https://storage.example/clip.mp4",
        is_sized: false,
        type: MediaType.Video,
      },
    ]);

    expect(data.currentMedia).toHaveLength(1);
    expect(snackBar.open).toHaveBeenCalledWith(
      "Media uploaded. It will appear after the safety check finishes.",
      "Dismiss",
      {
        duration: 4000,
        horizontalPosition: "center",
        verticalPosition: "bottom",
      }
    );
  });
});
