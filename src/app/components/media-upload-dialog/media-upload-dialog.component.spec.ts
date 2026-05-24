import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaType } from "../../../db/models/Interfaces";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { AnalyticsService } from "../../services/analytics.service";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import {
  MediaUploadDialogComponent,
  MediaUploadDialogData,
} from "./media-upload-dialog.component";

describe("MediaUploadDialogComponent", () => {
  let authService: {
    user: unknown;
  };
  let spotEditsService: {
    createSpotUpdateEdit: ReturnType<typeof vi.fn>;
  };
  let snackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let analytics: {
    reportError: ReturnType<typeof vi.fn>;
  };
  let dialogRef: {
    close: ReturnType<typeof vi.fn>;
    disableClose: boolean;
  };
  let data: MediaUploadDialogData;

  beforeEach(() => {
    authService = {
      user: {
        uid: "user-1",
        displayName: "Uploader",
        data: {
          uid: "user-1",
          displayName: "Uploader",
        },
      },
    };
    spotEditsService = {
      createSpotUpdateEdit: vi.fn().mockResolvedValue("edit-1"),
    };
    snackBar = {
      open: vi.fn(),
    };
    analytics = {
      reportError: vi.fn(),
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
        { provide: AuthenticationService, useValue: authService },
        { provide: SpotEditsService, useValue: spotEditsService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AnalyticsService, useValue: analytics },
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

  it("appends uploaded media through a spot edit with the signed-in user reference", async () => {
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

    expect(spotEditsService.createSpotUpdateEdit).toHaveBeenCalledWith(
      "spot-1",
      {
        media: [
          data.currentMedia?.[0],
          {
            src: "https://storage.example/new.jpg",
            type: MediaType.Image,
            uid: "user-1",
            origin: "user",
            isInStorage: true,
          },
          {
            src: "https://storage.example/clip.mp4",
            type: MediaType.Video,
            uid: "user-1",
            origin: "user",
            isInStorage: true,
          },
        ],
      },
      {
        uid: "user-1",
        display_name: "Uploader",
      }
    );
    expect(data.currentMedia).toHaveLength(3);
    expect(snackBar.open).toHaveBeenCalledWith(
      "2 media item(s) added successfully!",
      "Dismiss",
      {
        duration: 3000,
        horizontalPosition: "center",
        verticalPosition: "bottom",
      }
    );
  });

  it("does not create a spot edit when the user is signed out", async () => {
    authService.user = null;
    const component = createComponent();

    await component.onMediaBatchUploaded([
      {
        src: "https://storage.example/new.jpg",
        is_sized: true,
        type: MediaType.Image,
      },
    ]);

    expect(spotEditsService.createSpotUpdateEdit).not.toHaveBeenCalled();
    expect(data.currentMedia).toHaveLength(1);
  });

  it("reports and surfaces spot edit failures without mutating dialog media state", async () => {
    const error = new Error("function failed");
    spotEditsService.createSpotUpdateEdit.mockRejectedValue(error);
    const component = createComponent();

    await component.onMediaBatchUploaded([
      {
        src: "https://storage.example/new.jpg",
        is_sized: true,
        type: MediaType.Image,
      },
    ]);

    expect(data.currentMedia).toHaveLength(1);
    expect(analytics.reportError).toHaveBeenCalledWith(error, {
      context: "spot_media_append_failed",
      feature: "spots",
      action: "add_spot_media",
      userFacing: true,
      properties: {
        spot_id: "spot-1",
        attempted_media_count: 1,
        resulting_media_count: 2,
      },
    });
    expect(snackBar.open).toHaveBeenCalledWith(
      "Failed to add media. Please try again.",
      "Dismiss",
      {
        duration: 3000,
      }
    );
  });
});
