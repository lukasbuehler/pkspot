import {
  Component,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { User } from "../../../db/models/User";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { StorageService } from "../../services/firebase/storage.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Timestamp } from "firebase/firestore";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import {
  MatDatepickerInput,
  MatDatepickerToggle,
  MatDatepicker,
} from "@angular/material/datepicker";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatSuffix,
  MatHint,
} from "@angular/material/form-field";
import { MatButton } from "@angular/material/button";
import { MediaUpload } from "../media-upload/media-upload.component";
import { MatBadge } from "@angular/material/badge";
import { MatIcon } from "@angular/material/icon";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { getValueFromEventTarget } from "../../../scripts/Helpers";
import { UserSchema } from "../../../db/schemas/UserSchema";
import { CropImageComponent } from "../crop-image/crop-image.component";
import { StorageBucket } from "../../../db/schemas/Media";

@Component({
  selector: "app-edit-profile",
  templateUrl: "./edit-profile.component.html",
  styleUrls: ["./edit-profile.component.scss"],
  imports: [
    MatBadge,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatSuffix,
    MatDatepicker,
    MatHint,
    MatProgressSpinner,
    CropImageComponent,
    MatIcon,
  ],
})
export class EditProfileComponent implements OnInit {
  @Output("changes")
  changes: EventEmitter<boolean> = new EventEmitter<boolean>();

  user: User | null = null;
  // user properties
  displayName: string | null = null;
  biography: string | null = null;
  startDate: Date | null = null;

  newProfilePicture: File | null = null;
  newProfilePictureSrc: string = "";
  croppedProfilePicture: string = "";
  croppingComplete: boolean = false;
  isUpdatingProfilePicture: boolean = false;

  getValueFromEventTarget = getValueFromEventTarget;

  constructor(
    public authService: AuthenticationService,
    private _userService: UsersService,
    private _storageService: StorageService,
    private _snackbar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Check if user is already available
    if (this.authService?.user?.data) {
      this.user = this.authService.user.data;
      this._updateInfoOnView();
    }

    // Subscribe to auth state changes
    this.authService.authState$.subscribe((authUser) => {
      if (authUser?.data) {
        this.user = authUser.data;
        this._updateInfoOnView();
      }
    });
  }

  private _updateInfoOnView() {
    if (this.user) {
      this.displayName = this.user.displayName ?? "";
      this.startDate = this.user.startDate ?? null;
      this.biography = this.user.biography ?? "";
    }
  }

  setNewProfilePicture(file: File) {
    this.newProfilePicture = file;

    // Read the file as data URL for the cropper
    const reader = new FileReader();
    reader.onload = (event) => {
      this.newProfilePictureSrc = event.target!.result as string;
      this.croppingComplete = false;
    };

    reader.readAsDataURL(file);
    this.detectIfChanges();
  }

  /**
   * Handle profile picture file selection from input element
   */
  onProfilePictureFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.setNewProfilePicture(input.files[0]);
    }
  }

  /**
   * Handle the cropped image blob from the CropImageComponent
   */
  onImageCropped(croppedBlob: Blob) {
    // Convert the blob to a data URL for preview
    const reader = new FileReader();
    reader.onload = (event) => {
      this.croppedProfilePicture = event.target!.result as string;
      this.croppingComplete = true;
    };
    reader.readAsDataURL(croppedBlob);

    // Store the blob for upload
    this.newProfilePicture = new File([croppedBlob], "profile-picture.png", {
      type: "image/png",
    });

    this.detectIfChanges();
  }

  /**
   * Cancel profile picture upload and reset cropping state
   */
  cancelProfilePictureUpload() {
    this.newProfilePicture = null;
    this.newProfilePictureSrc = "";
    this.croppedProfilePicture = "";
    this.croppingComplete = false;
    this.detectIfChanges();
  }

  saveNewProfilePicture() {
    this._handleProfilePictureUploadAndSave()
      .then(() => {
        this._snackbar.open(
          "Successfully saved new profile picture",
          "Dismiss",
          {
            duration: 3000,
            horizontalPosition: "center",
            verticalPosition: "bottom",
          }
        );
      })
      .catch((readableError) => {
        this._snackbar.open(readableError, "Dismiss", {
          duration: 5000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        });
      });
  }

  private _handleProfilePictureUploadAndSave(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.user && this.user.uid && this.newProfilePicture) {
        const userId = this.user.uid;
        this.isUpdatingProfilePicture = true;

        // Upload new profile picture with userid as filename
        // Since we generate token-free public URLs, replacing the file keeps the same URL format
        this._storageService
          .setUploadToStorage(
            this.newProfilePicture,
            "profile-pictures" as any,
            undefined,
            userId,
            "png"
          )
          .then((url) => {
            // Update user document with new profile picture URL
            return this._userService.updateUser(userId, {
              profile_picture: url,
            });
          })
          .then(() => {
            this.isUpdatingProfilePicture = false;
            this.newProfilePicture = null;
            // Refresh user data with new profile picture
            if (this.user?.data?.profile_picture) {
              this.user.setProfilePicture(this.user.data.profile_picture);
            }
            this.croppedProfilePicture = "";
            this.newProfilePictureSrc = "";
            this.croppingComplete = false;
            resolve();
          })
          .catch((err) => {
            console.error("Error uploading or saving profile picture:", err);
            this.isUpdatingProfilePicture = false;
            reject(
              err instanceof Error
                ? err.message
                : "Error uploading the profile picture!"
            );
          });
      } else {
        reject("Missing user ID or profile picture");
      }
    });
  }

  detectIfChanges() {
    if (
      this.displayName !== this.user?.displayName ||
      this.newProfilePicture ||
      this.startDate !== this.user.startDate ||
      this.biography !== this.user.biography
    ) {
      this.changes.emit(true);
    } else {
      this.changes.emit(false);
    }
  }

  saveAllChanges() {
    if (this.user && this.user.uid) {
      let promises: Promise<void>[] = [];
      let data: UserSchema = {};

      // Update display name if changed
      if (this.displayName !== this.user.displayName) {
        data.display_name = this.displayName ?? undefined;
      }

      if (this.biography !== this.user.biography) {
        data.biography = this.biography ?? undefined;
      }

      // Update profile picture if changed
      if (this.newProfilePictureSrc && this.newProfilePicture) {
        promises.push(this._handleProfilePictureUploadAndSave());
      }

      // Start date
      if (this.startDate && this.startDate !== this.user.startDate) {
        data.start_date = new Timestamp(this.startDate.getTime() / 1000, 0);
      }

      // Update user data if changed
      if (Object.keys(data).length > 0) {
        promises.push(this._userService.updateUser(this.user.uid, data));
      }

      return Promise.all(promises);
    }
  }
}
