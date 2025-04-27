import {
  Component,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { User } from "../../db/models/User";
import { AuthenticationService } from "../services/firebase/authentication.service";
import { StorageService } from "../services/firebase/storage.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Timestamp } from "@firebase/firestore";
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
import { NgIf } from "@angular/common";
import { UsersService } from "../services/firebase/firestore/users.service";
import { getValueFromEventTarget } from "../../scripts/Helpers";
import { UserSchema } from "../../db/schemas/UserSchema";

@Component({
  selector: "app-edit-profile",
  templateUrl: "./edit-profile.component.html",
  styleUrls: ["./edit-profile.component.scss"],
  imports: [
    NgIf,
    MatBadge,
    MediaUpload,
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
  isUpdatingProfilePicture: boolean = false;

  getValueFromEventTarget = getValueFromEventTarget;

  constructor(
    public authService: AuthenticationService,
    private _userService: UsersService,
    private _storageService: StorageService,
    private _snackbar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.user = this.authService?.user?.data ?? null;
    this._updateInfoOnView();

    this.authService.authState$.subscribe((user) => {
      this.user = user?.data ?? null;
      this._updateInfoOnView();
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

    let reader = new FileReader();
    reader.onload = (event) => {
      this.newProfilePictureSrc = event.target!.result as string;
    };

    reader.readAsDataURL(file);
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
      if (this.user && this.user.uid && this.newProfilePictureSrc) {
        const userId = this.user.uid;
        this.isUpdatingProfilePicture = true;

        // this.croppieObj
        //   .result({
        //     type: "blob",
        //     format: "png",
        //     circle: false,
        //   })
        //   .then((blob) => {
        //     this._storageService
        //       .setUploadToStorage(blob, StorageFolder.ProfilePictures, userId)
        //       .then(
        //         (url) => {
        //           this._userService
        //             .updateUser(userId, {
        //               profile_picture: url,
        //             })
        //             .then(() => {
        //               this.isUpdatingProfilePicture = false;
        //               this.newProfilePicture = null;
        //               this.user!.profilePicture = url;
        //               this.newProfilePictureSrc = "";
        //               this.croppieObj!.destroy();
        //               resolve();
        //             })
        //             .catch((err) => {
        //               console.error(
        //                 "Error saving the url to the newly uploaded profile picture",
        //                 err
        //               );
        //               this.isUpdatingProfilePicture = false;
        //               reject("Error saving the uploaded profile picture!");
        //             });
        //         },
        //         (err) => {
        //           console.error("Error on profile picture upload", err);
        //           reject("Error uploading the cropped image!");
        //           this.isUpdatingProfilePicture = false;
        //         }
        //       );
        //   })
        //   .catch((err) => {
        //     console.error("Error getting the blob from croppie", err);
        //     reject("Error Cropping the image!");
        //     this.isUpdatingProfilePicture = false;
        //   });
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
