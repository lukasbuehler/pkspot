import {
  Component,
  Inject,
  LOCALE_ID,
  OnInit,
  ChangeDetectionStrategy,
  input,
  linkedSignal,
  output,
} from "@angular/core";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { User } from "../../../db/models/User";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { getValueFromEventTarget } from "../../../scripts/Helpers";
import { MatIcon } from "@angular/material/icon";
import { MatDialog } from "@angular/material/dialog";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatHint,
  MatSuffix,
} from "@angular/material/form-field";
import { FormsModule, ReactiveFormsModule, FormControl } from "@angular/forms";
import { AsyncPipe } from "@angular/common";
import { MatButton, MatButtonModule } from "@angular/material/button";
import { StorageService } from "../../services/firebase/storage.service";
import { StorageBucket } from "../../../db/schemas/Media";
import { MatBadge } from "@angular/material/badge";
import { LocaleCode } from "../../../db/models/Interfaces";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { firstValueFrom, Observable, startWith, map } from "rxjs";
import { countries } from "../../../scripts/Countries";
import { Timestamp } from "@angular/fire/firestore";
import {
  MatDatepickerInput,
  MatDatepickerToggle,
  MatDatepickerModule,
} from "@angular/material/datepicker";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { getProfilePictureUrl } from "../../../scripts/ProfilePictureHelper";
import { ExternalImage } from "../../../db/models/Media";
import { MatExpansionModule } from "@angular/material/expansion";
import {
  UserSchema,
  UserSocialsSchema,
} from "../../../db/schemas/UserSchema";
import { AutocompleteOverlayRepositionDirective } from "../../directives/autocomplete-overlay-reposition.directive";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import {
  NormalizedProfileSocials,
  normalizeProfileSocials,
} from "../../utils/profile-social-links";
import {
  ImageCropDialogComponent,
  type ImageCropDialogData,
} from "../crop-image/image-crop-dialog.component";
import { PROFILE_IMAGE_CROP_POLICY } from "../crop-image/image-crop-policy";

@Component({
  selector: "app-edit-profile",
  templateUrl: "./edit-profile.component.html",
  styleUrls: ["./edit-profile.component.scss"],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIcon,
    MatInput,
    MatFormField,
    MatLabel,
    FormsModule,
    MatButton,
    MatBadge,
    MatHint,
    MatAutocompleteModule,
    ReactiveFormsModule,
    AsyncPipe,
    MatButtonModule,
    MatDatepickerInput,
    MatDatepickerToggle,
    MatDatepickerModule,
    MatSuffix,
    MatProgressSpinner,
    MatExpansionModule,
    AutocompleteOverlayRepositionDirective,
  ],
})
export class EditProfileComponent implements OnInit {
  protected readonly userInput = input<User | undefined>(undefined, {
    alias: "user",
  });
  readonly user = linkedSignal(() => this.userInput());
  readonly changes = output<boolean>();

  displayName: string = "";
  biography: string = "";
  startDate: Date | null = null;
  nationalityCode: string | null = null;
  instagramHandle: string = "";
  youtubeHandle: string = "";
  tiktokHandle: string = "";
  discordUrl: string = "";

  newProfilePicture: File | null = null;
  isUpdatingProfilePicture: boolean = false;
  tempProfilePictureSrc: string = ""; // Temporary storage for immediate UI update after upload
  isProfilePictureLoaded: boolean = true;
  hasProfilePictureError: boolean = false;
  private profilePictureUploadPromise: Promise<void> | null = null;

  // Country Autocomplete
  countries = countries;
  countryCodes = Object.keys(countries);
  filteredCountries: Observable<string[]> | null = null;
  countryControl = new FormControl("");

  getValueFromEventTarget = getValueFromEventTarget;

  constructor(
    public authService: AuthenticationService,
    private _userService: UsersService,
    private _storageService: StorageService,
    private _snackbar: MatSnackBar,
    private _ageAssuranceService: AgeAssuranceService,
    private _dialog: MatDialog,
    @Inject(LOCALE_ID) public locale: LocaleCode
  ) {}

  ngOnInit(): void {
    // Check if user is already available
    if (this.authService?.user?.data) {
      this.user.set(this.authService.user.data);
      this._updateInfoOnView();
    }

    // Subscribe to auth state changes
    this.authService.authState$.subscribe((authUser) => {
      if (authUser?.data) {
        this.user.set(authUser.data);
        this._updateInfoOnView();
      }
    });

    // Determine filter logic
    this.filteredCountries = this.countryControl.valueChanges.pipe(
      startWith(""),
      map((value) => this._filterCountries(value || ""))
    );

    // Update nationalityCode when countryControl changes (if valid selection)
    this.countryControl.valueChanges.subscribe((value) => {
      const val = (value || "").toLowerCase();
      /* 
          Try to find a match. 
          If user types "Germany", we find code "DE".
          If user types "DE", check if it matches a code directly (also acceptable).
       */
      const code = this.countryCodes.find(
        (c) =>
          this.countries[c].name.toLowerCase() === val ||
          c.toLowerCase() === val
      );

      if (code) {
        this.nationalityCode = code;
      } else {
        // If no match, clear code (or keep null)
        // If exact match doesn't exist, we set it to null.
        this.nationalityCode = null;
      }
      this.detectIfChanges();
    });
  }

  private _filterCountries(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.countryCodes.filter(
      (code) =>
        this.countries[code].name.toLowerCase().includes(filterValue) ||
        code.toLowerCase().includes(filterValue)
    );
  }

  private _updateInfoOnView() {
    const user = this.user();
    if (user) {
      this.displayName = user.displayName ?? "";
      this.startDate = user.startDate ?? null;
      this.biography = user.biography ?? "";
      this.nationalityCode = user.nationalityCode ?? null;
      this.instagramHandle = user.socials?.instagram_handle ?? "";
      this.youtubeHandle = user.socials?.youtube_handle ?? "";
      this.tiktokHandle = user.socials?.tiktok_handle ?? "";
      this.discordUrl = user.socials?.discord_url ?? "";

      if (this.nationalityCode && this.countries[this.nationalityCode]) {
        this.countryControl.setValue(this.countries[this.nationalityCode].name);
      } else {
        this.countryControl.setValue("");
      }
    }
  }

  async onProfilePictureFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    const croppedFile = await firstValueFrom(
      this._dialog
        .open<
          ImageCropDialogComponent,
          ImageCropDialogData,
          File | undefined
        >(ImageCropDialogComponent, {
          data: {
            file,
            policy: PROFILE_IMAGE_CROP_POLICY,
            title: $localize`Crop profile picture`,
          },
          maxWidth: "100vw",
          maxHeight: "100dvh",
          panelClass: "image-crop-dialog-panel",
        })
        .afterClosed(),
      { defaultValue: undefined },
    );
    if (!croppedFile) return;

    this.newProfilePicture = croppedFile;
    if (
      this.tempProfilePictureSrc &&
      this.tempProfilePictureSrc.startsWith("blob:")
    ) {
      URL.revokeObjectURL(this.tempProfilePictureSrc);
    }
    this.tempProfilePictureSrc = URL.createObjectURL(croppedFile);
    this.isProfilePictureLoaded = true;
    this.hasProfilePictureError = false;
    await this.saveNewProfilePicture();
    this.detectIfChanges();
  }

  cancelProfilePictureUpload(): void {
    this.newProfilePicture = null;
    if (
      this.tempProfilePictureSrc &&
      this.tempProfilePictureSrc.startsWith("blob:")
    ) {
      URL.revokeObjectURL(this.tempProfilePictureSrc);
      this.tempProfilePictureSrc = "";
    }
    this.detectIfChanges();
  }

  async saveNewProfilePicture(): Promise<void> {
    if (this.profilePictureUploadPromise) {
      return this.profilePictureUploadPromise;
    }

    if (!this._ageAssuranceService.canParticipatePublicly()) {
      this._snackbar.open(
        this._ageAssuranceService.getRestrictionMessage(),
        "Dismiss",
        {
          duration: 6000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        }
      );
      return;
    }

    try {
      await this._handleProfilePictureUploadAndSave();
      this._snackbar.open(
        $localize`Successfully saved new profile picture`,
        $localize`Dismiss`,
        {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : $localize`Error uploading the profile picture.`;
      this._snackbar.open(message, $localize`Dismiss`, {
        duration: 5000,
        horizontalPosition: "center",
        verticalPosition: "bottom",
      });
    }
  }

  private async _handleProfilePictureUploadAndSave(): Promise<void> {
    if (this.profilePictureUploadPromise) {
      return this.profilePictureUploadPromise;
    }

    this.profilePictureUploadPromise = this._performProfilePictureUploadAndSave();
    try {
      await this.profilePictureUploadPromise;
    } finally {
      this.profilePictureUploadPromise = null;
    }
  }

  private async _performProfilePictureUploadAndSave(): Promise<void> {
    const user = this.user();
    if (!user?.uid || !this.newProfilePicture) {
      throw new Error("Missing user ID or profile picture");
    }

    const userId = user.uid;
    this.isUpdatingProfilePicture = true;

    try {
      // 1. Delete only the original profile picture path.
      // Resized variants are overwritten by the extension and deleting them
      // here can race with in-flight extension writes on repeated uploads.
      const originalPath = `${StorageBucket.ProfilePictures}/${userId}`;
      await this._storageService
        .deleteFromStorage(originalPath)
        .catch((e) =>
          console.warn(`Ignored delete error for ${originalPath}:`, e)
        );

      // 2. Upload new profile picture
      // Since we generate token-free public URLs, replacing the file keeps the same URL format
      await this._storageService.setUploadToStorage(
        this.newProfilePicture,
        StorageBucket.ProfilePictures,
        undefined,
        userId,
        undefined,
        "public, max-age=31536000"
      );

      // 3. Update user document
      // Use predictable token-free URL from ProfilePictureHelper (no query params)
      const profilePictureUrl = getProfilePictureUrl(userId);

      await this._userService.updateUser(userId, {
        profile_picture: profilePictureUrl,
      });

      // 4. Update local state
      this.isUpdatingProfilePicture = false;
      this.newProfilePicture = null;

      // Refresh user data with new profile picture
      if (user.data) {
        // Update the data object reference with the new URL string
        user.data.profile_picture = profilePictureUrl;

        if (this.tempProfilePictureSrc) {
          // Use ExternalImage with the local data URL for immediate, reliable update across the app (Nav Bar)
          // AND set it as an override in AuthService so it persists through Firestore updates
          const override = new ExternalImage(this.tempProfilePictureSrc);
          this.authService.overrideProfilePicture = override;
          user.profilePicture = override;
        } else {
          user.setProfilePicture(profilePictureUrl);
        }

        // Notify subscribers (like the Nav Bar) that the user data has changed
        this.authService.authState$.next(this.authService.user);
      }

      this.hasProfilePictureError = false;
      this.isProfilePictureLoaded = true;
    } catch (err) {
      console.error("Error uploading or saving profile picture:", err);
      this.isUpdatingProfilePicture = false;
      throw err instanceof Error
        ? err.message
        : "Error uploading the profile picture!";
    }
  }

  detectIfChanges() {
    const user = this.user();
    const currentSocials = this._buildCurrentSocials();
    const originalSocials = this._buildOriginalSocials();

    if (
      this.displayName !== user?.displayName ||
      this.startDate !== user?.startDate ||
      this.biography !== user?.biography ||
      this.nationalityCode !== (user?.nationalityCode ?? null) ||
      JSON.stringify(currentSocials) !== JSON.stringify(originalSocials)
    ) {
      this.changes.emit(true);
    } else {
      this.changes.emit(false);
    }
  }

  discardChanges() {
    // TODO: Discard changes
    this._updateInfoOnView();
    this.cancelProfilePictureUpload();
    this.detectIfChanges();
  }

  saveAllChanges(): Promise<void> {
    const user = this.user();
    if (!user?.uid) return Promise.reject("No user");
    if (!this._ageAssuranceService.canParticipatePublicly()) {
      this._snackbar.open(
        this._ageAssuranceService.getRestrictionMessage(),
        "Dismiss",
        {
          duration: 6000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        }
      );
      return Promise.reject("Public profile participation is read-only");
    }

    const data: Partial<UserSchema> = {};

    if (this.displayName !== user.displayName) {
      data.display_name = this.displayName;
    }

    if (this.startDate !== user.startDate) {
      data.start_date = this.startDate
        ? Timestamp.fromDate(this.startDate)
        : undefined;
    }

    if (this.biography !== user.biography) {
      data.biography = this.biography;
    }

    if (this.nationalityCode !== user.nationalityCode) {
      data.nationality_code = this.nationalityCode ?? undefined;
    }

    const currentSocials = this._buildCurrentSocials();
    const originalSocials = this._buildOriginalSocials();
    if (JSON.stringify(currentSocials) !== JSON.stringify(originalSocials)) {
      const socials: UserSocialsSchema = {};
      if (currentSocials.instagram_handle) {
        socials.instagram_handle = currentSocials.instagram_handle;
      }
      if (currentSocials.youtube_handle) {
        socials.youtube_handle = currentSocials.youtube_handle;
      }
      if (currentSocials.tiktok_handle) {
        socials.tiktok_handle = currentSocials.tiktok_handle;
      }
      if (currentSocials.discord_url) {
        socials.discord_url = currentSocials.discord_url;
      }
      if (user.socials?.other) {
        socials.other = user.socials.other;
      }
      data.socials = socials;
    }

    // Save profile picture first if any
    let promise = Promise.resolve();
    if (this.newProfilePicture) {
      promise = this._handleProfilePictureUploadAndSave();
    }

    return promise.then(() => {
      if (Object.keys(data).length > 0) {
        return this._userService.updateUser(user.uid, data);
      }
      return Promise.resolve();
    });
  }

  private _buildCurrentSocials(): NormalizedProfileSocials {
    return normalizeProfileSocials({
      instagram_handle: this.instagramHandle,
      youtube_handle: this.youtubeHandle,
      tiktok_handle: this.tiktokHandle,
      discord_url: this.discordUrl,
    });
  }

  private _buildOriginalSocials(): NormalizedProfileSocials {
    return normalizeProfileSocials(this.user()?.socials);
  }
}
