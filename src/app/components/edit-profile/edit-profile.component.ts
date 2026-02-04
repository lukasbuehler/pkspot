import {
  Component,
  EventEmitter,
  Inject,
  Input,
  LOCALE_ID,
  OnInit,
  Output,
} from "@angular/core";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { User } from "../../../db/models/User";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { MatSnackBar } from "@angular/material/snack-bar";
import { getValueFromEventTarget } from "../../../scripts/Helpers";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { Spot } from "../../../db/models/Spot";
import { CropImageComponent } from "../crop-image/crop-image.component";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatHint,
  MatSuffix,
} from "@angular/material/form-field";
import { FormsModule, ReactiveFormsModule, FormControl } from "@angular/forms";
import { NgIf, NgFor, AsyncPipe } from "@angular/common";
import {
  MatButton,
  MatIconButton,
  MatButtonModule,
} from "@angular/material/button";
import { MatMenu, MatMenuTrigger } from "@angular/material/menu";
import { SearchFieldComponent } from "../search-field/search-field.component";
import { StorageService } from "../../services/firebase/storage.service";
import { StorageBucket } from "../../../db/schemas/Media";
import { MatBadge } from "@angular/material/badge";
import { LocaleCode } from "../../../db/models/Interfaces";
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { Observable, startWith, map } from "rxjs";
import { countries } from "../../../scripts/Countries";
import { SpotId } from "../../../db/schemas/SpotSchema";
import {
  MatDatepickerInput,
  MatDatepickerToggle,
  MatDatepickerModule,
} from "@angular/material/datepicker";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { getProfilePictureUrl } from "../../../scripts/ProfilePictureHelper";
import { StorageImage, ExternalImage } from "../../../db/models/Media";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

@Component({
  selector: "app-edit-profile",
  templateUrl: "./edit-profile.component.html",
  styleUrls: ["./edit-profile.component.scss"],
  imports: [
    CropImageComponent,
    MatIcon,
    MatInput,
    MatFormField,
    MatLabel,
    FormsModule,
    MatButton,
    MatIconButton,
    SearchFieldComponent,
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
    SpotPreviewCardComponent,
  ],
})
export class EditProfileComponent implements OnInit {
  @Input() user: User | undefined;
  @Output() changes = new EventEmitter<boolean>();

  displayName: string = "";
  biography: string = "";
  homeSpots: string[] = [];
  homeSpotsObjects: Spot[] = [];
  startDate: Date | null = null;
  nationalityCode: string | null = null;
  homeCity: string | null = null;

  newProfilePicture: File | null = null;
  newProfilePictureSrc: string = "";
  croppedProfilePicture: string = "";
  croppingComplete: boolean = false;
  isUpdatingProfilePicture: boolean = false;
  tempProfilePictureSrc: string = ""; // Temporary storage for immediate UI update after upload
  isProfilePictureLoaded: boolean = true;
  hasProfilePictureError: boolean = false;

  // Country Autocomplete
  countries = countries;
  countryCodes = Object.keys(countries);
  filteredCountries: Observable<string[]> | null = null;
  countryControl = new FormControl("");

  getValueFromEventTarget = getValueFromEventTarget;

  constructor(
    public authService: AuthenticationService,
    private _userService: UsersService,
    private _spotsService: SpotsService,
    private _storageService: StorageService,
    private _snackbar: MatSnackBar,
    @Inject(LOCALE_ID) public locale: LocaleCode
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
    if (this.user) {
      this.displayName = this.user.displayName ?? "";
      this.startDate = this.user.startDate ?? null;
      this.biography = this.user.biography ?? "";
      this.homeSpots = [...(this.user.homeSpots ?? [])];
      this.nationalityCode = this.user.nationalityCode ?? null;
      this.homeCity = this.user.homeCity ?? null;

      if (this.nationalityCode && this.countries[this.nationalityCode]) {
        this.countryControl.setValue(this.countries[this.nationalityCode].name);
      } else {
        this.countryControl.setValue("");
      }

      // Fetch home spots if any
      if (this.homeSpots.length > 0) {
        this.homeSpots.forEach((spotId) => {
          this._spotsService
            .getSpotById(spotId as SpotId, this.locale)
            .then((spot) => {
              if (
                spot &&
                !this.homeSpotsObjects.find((s) => s.id === spot.id)
              ) {
                this.homeSpotsObjects.push(spot);
              }
            })
            .catch(console.error);
        });
      }
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
    console.log("Image cropped, starting auto-save...");

    // 1. Store the blob for upload
    this.newProfilePicture = new File([croppedBlob], "profile-picture.png", {
      type: "image/png",
    });

    // 2. Set temp source immediately using Object URL
    if (
      this.tempProfilePictureSrc &&
      this.tempProfilePictureSrc.startsWith("blob:")
    ) {
      URL.revokeObjectURL(this.tempProfilePictureSrc);
    }
    this.tempProfilePictureSrc = URL.createObjectURL(croppedBlob);

    // 3. Update state
    this.isProfilePictureLoaded = true;
    this.hasProfilePictureError = false;
    this.croppingComplete = true;

    // 4. Trigger upload
    this.saveNewProfilePicture();

    // 5. Ensure detectIfChanges doesn't block anything (it shouldn't, as we auto-save)
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
        console.log("saveNewProfilePicture success");
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

  private async _handleProfilePictureUploadAndSave(): Promise<void> {
    if (!this.user || !this.user.uid || !this.newProfilePicture) {
      throw new Error("Missing user ID or profile picture");
    }

    const userId = this.user.uid;
    this.isUpdatingProfilePicture = true;

    try {
      // 1. Delete existing profile picture and all resized versions
      const filesToDelete = [
        // Delete files without extension (correct format)
        `${StorageBucket.ProfilePictures}/${userId}`,
        ...StorageImage.SIZES.map(
          (size) => `${StorageBucket.ProfilePictures}/${userId}_${size}x${size}`
        ),
      ];

      await Promise.all(
        filesToDelete.map((path) =>
          this._storageService
            .deleteFromStorage(path)
            .catch((e) => console.warn(`Ignored delete error for ${path}:`, e))
        )
      );
      // Successfully deleted the old profile picture

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
      if (this.user?.data) {
        // Update the data object reference with the new URL string
        this.user.data.profile_picture = profilePictureUrl;

        if (this.tempProfilePictureSrc) {
          // Use ExternalImage with the local data URL for immediate, reliable update across the app (Nav Bar)
          // AND set it as an override in AuthService so it persists through Firestore updates
          const override = new ExternalImage(this.tempProfilePictureSrc);
          this.authService.overrideProfilePicture = override;
          this.user.profilePicture = override;
        } else {
          this.user.setProfilePicture(profilePictureUrl);
        }

        // Notify subscribers (like the Nav Bar) that the user data has changed
        this.authService.authState$.next(this.authService.user);
      }

      // Use the cropped data URL as a temporary display to avoid broken image during resize
      if (this.croppedProfilePicture) {
        this.tempProfilePictureSrc = this.croppedProfilePicture;
        this.hasProfilePictureError = false;
        this.isProfilePictureLoaded = true;
      }

      this.croppedProfilePicture = "";
      this.newProfilePictureSrc = "";
      this.croppingComplete = false;
    } catch (err) {
      console.error("Error uploading or saving profile picture:", err);
      this.isUpdatingProfilePicture = false;
      throw err instanceof Error
        ? err.message
        : "Error uploading the profile picture!";
    }
  }

  onSpotSelected(selection: { type: "place" | "spot"; id: string }) {
    if (selection.type === "spot") {
      // Check limit
      if (this.homeSpots.length >= 3) {
        this._snackbar.open("You can only have up to 3 home spots.", "OK", {
          duration: 3000,
        });
        return;
      }

      const addSpot = (spot: Spot) => {
        if (this.homeSpots.includes(spot.id)) return;
        this.homeSpots.push(spot.id);
        this.homeSpotsObjects.push(spot);
        this.detectIfChanges();
      };

      this._spotsService
        .getSpotById(selection.id as SpotId, this.locale)
        .then((spot) => {
          addSpot(spot);
        })
        .catch(() => {
          // If ID lookup fails, try lookup by slug
          this._spotsService
            .getSpotBySlug(selection.id, this.locale)
            .then((spot) => {
              if (spot) {
                addSpot(spot);
              }
            });
        });
    }
  }

  removeHomeSpot(spotId: string) {
    this.homeSpots = this.homeSpots.filter((id) => id !== spotId);
    this.homeSpotsObjects = this.homeSpotsObjects.filter(
      (spot) => spot.id !== spotId
    );
    this.detectIfChanges();
  }

  detectIfChanges() {
    const currentHomeSpots = [...this.homeSpots].sort();
    const originalHomeSpots = [...(this.user?.homeSpots || [])].sort();

    if (
      this.displayName !== this.user?.displayName ||
      this.startDate !== this.user?.startDate ||
      this.biography !== this.user?.biography ||
      this.nationalityCode !== (this.user?.nationalityCode ?? null) ||
      this.homeCity !== (this.user?.homeCity ?? null) ||
      JSON.stringify(currentHomeSpots) !== JSON.stringify(originalHomeSpots)
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
    if (!this.user || !this.user.uid) return Promise.reject("No user");

    const data: any = {};

    if (this.displayName !== this.user.displayName) {
      data.display_name = this.displayName;
    }

    if (this.startDate !== this.user.startDate) {
      data.start_date = this.startDate;
    }

    if (this.biography !== this.user.biography) {
      data.biography = this.biography;
    }

    if (
      JSON.stringify(this.homeSpots.sort()) !==
      JSON.stringify(this.user.homeSpots.sort())
    ) {
      data.home_spots = this.homeSpots;
    }

    if (this.nationalityCode !== this.user.nationalityCode) {
      data.nationality_code = this.nationalityCode ?? undefined;
    }

    if (this.homeCity !== this.user.homeCity) {
      data.home_city = this.homeCity ?? undefined;
    }

    // Save profile picture first if any
    let promise = Promise.resolve();
    if (this.newProfilePicture) {
      promise = this._handleProfilePictureUploadAndSave();
    }

    return promise.then(() => {
      if (Object.keys(data).length > 0) {
        return this._userService.updateUser(this.user!.uid, data);
      }
      return Promise.resolve();
    });
  }
}
