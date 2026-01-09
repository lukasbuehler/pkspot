import { Component, OnInit, ViewChild } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router } from "@angular/router";
import { NgClass, NgSwitch, NgSwitchCase } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EditProfileComponent } from "../edit-profile/edit-profile.component";
import {
  SpeedDialFabButtonConfig,
  SpeedDialFabComponent,
} from "../speed-dial-fab/speed-dial-fab.component";
import { MatTooltip } from "@angular/material/tooltip";
import { MatInput } from "@angular/material/input";
import {
  MatFormField,
  MatLabel,
  MatSuffix,
  MatHint,
} from "@angular/material/form-field";
import { MatDivider } from "@angular/material/divider";
import { MatBadge } from "@angular/material/badge";
import { MatIcon } from "@angular/material/icon";
import { MatButton } from "@angular/material/button";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MetaTagService } from "../../services/meta-tag.service";

@Component({
  selector: "app-settings-page",
  templateUrl: "./settings-page.component.html",
  styleUrls: ["./settings-page.component.scss"],
  imports: [
    MatButton,
    NgClass,
    MatIcon,
    MatBadge,
    NgSwitch,
    MatDivider,
    EditProfileComponent,
    NgSwitchCase,
    MatFormField,
    MatLabel,
    MatInput,
    MatSuffix,
    MatTooltip,
    MatHint,
    SpeedDialFabComponent,
    FormsModule,
    MatProgressSpinner,
  ],
})
export class SettingsPageComponent implements OnInit {
  @ViewChild("editProfileComponent") editProfileComponent:
    | EditProfileComponent
    | undefined;

  constructor(
    public authService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router,
    private _snackbar: MatSnackBar,
    private _metaTagService: MetaTagService
  ) {}

  menuPoints = [
    {
      id: "profile",
      name: $localize`Public profile`,
      icon: "person",
      hasChanges: false,
    },
    {
      id: "account",
      name: $localize`Account`,
      icon: "manage_accounts",
      hasChanges: false,
    },
    {
      id: "general",
      name: $localize`General`,
      icon: "settings",
      hasChanges: false,
    },
  ];

  selectedPoint: string = "profile";

  hasChanges: boolean = false;

  speedDialButtonConfig: SpeedDialFabButtonConfig = {
    mainButton: {
      icon: "save",
      tooltip: "Save all changes",
      color: "accent",
    },
    miniButtonColor: "default",
    miniButtons: [
      {
        icon: "clear",
        tooltip: "Discard all changes",
      },
    ],
  };

  emailAddress?: string;
  newEmailAddress: string = "";
  emailChangePassword: string = "";
  isChangingEmail: boolean = false;

  currentPassword: string = "";
  newPassword: string = "";
  confirmNewPassword: string = "";
  isChangingPassword: boolean = false;

  deleteAccountPassword: string = "";
  isDeletingAccount: boolean = false;
  showDeleteConfirmation: boolean = false;

  isEmailExpanded: boolean = false;
  isPasswordExpanded: boolean = false;

  get isOAuthUser(): boolean {
    const providerId = this.authService.user.providerId;
    return providerId === "google.com" || providerId === "apple.com";
  }

  get providerDisplayName(): string {
    const providerId = this.authService.user.providerId;
    if (providerId === "google.com") return "Google";
    if (providerId === "apple.com") return "Apple";
    return "";
  }

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      $localize`Settings`,
      $localize`Manage your profile and account settings.`
    );

    this.emailAddress = this.authService?.user?.email || "";
    this.authService.authState$.subscribe((user) => {
      this.emailAddress = user?.email;
      if (!user || !user.uid) {
        this.router.navigate(["/sign-in"]);
      }
    });

    let tab: string = this.route.snapshot.paramMap.get("tab") || "";
    if (tab) {
      this.openMenuPoint(tab);
    }
  }

  openMenuPoint(pointId: string) {
    // Check if this point id exists
    const point = this.menuPoints.find((menuPoint) => menuPoint.id === pointId);
    if (point) {
      this.selectedPoint = pointId;
      this.updateURL(pointId);

      this._metaTagService.setStaticPageMetaTags(
        $localize`Settings - ` + point.name,
        $localize`Manage your ${point.name} settings.`
      );
    }
    // else do nothing
  }

  updateURL(selectedPoint: string) {
    this.router.navigate(["/settings", selectedPoint]);
  }

  verifyUserEmailAddress() {
    if (this.authService?.user?.emailVerified === true) {
      return;
    }

    this.authService.resendVerificationEmail().then(
      () => {
        this._snackbar.open(
          "Verification E-Mail successfully re-sent",
          "Dismiss",
          {
            duration: 3000,
            horizontalPosition: "center",
            verticalPosition: "bottom",
          }
        );
      },
      (err) => {
        console.error("There was an error sending the E-mail verification");
      }
    );
  }

  changeEmailAddress() {
    if (!this.newEmailAddress || !this.emailChangePassword) {
      this._snackbar.open($localize`Please fill in all fields`, "OK", {
        duration: 3000,
      });
      return;
    }

    this.isChangingEmail = true;
    this.authService
      .changeEmail(this.newEmailAddress, this.emailChangePassword)
      .then(() => {
        this._snackbar.open(
          $localize`Email changed successfully. Please verify your new email.`,
          "OK",
          { duration: 5000 }
        );
        this.newEmailAddress = "";
        this.emailChangePassword = "";
        this.isEmailExpanded = false;
      })
      .catch((err) => {
        console.error("Error changing email:", err);
        let message = $localize`Error changing email. Please check your password.`;
        if (err.code === "auth/wrong-password") {
          message = $localize`Incorrect password. Please try again.`;
        } else if (err.code === "auth/invalid-email") {
          message = $localize`Invalid email address.`;
        } else if (err.code === "auth/email-already-in-use") {
          message = $localize`This email is already in use.`;
        }
        this._snackbar.open(message, "OK", { duration: 5000 });
      })
      .finally(() => {
        this.isChangingEmail = false;
      });
  }

  changePassword() {
    if (
      !this.currentPassword ||
      !this.newPassword ||
      !this.confirmNewPassword
    ) {
      this._snackbar.open($localize`Please fill in all fields`, "OK", {
        duration: 3000,
      });
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this._snackbar.open($localize`New passwords do not match`, "OK", {
        duration: 3000,
      });
      return;
    }

    if (this.newPassword.length < 6) {
      this._snackbar.open(
        $localize`Password must be at least 6 characters`,
        "OK",
        { duration: 3000 }
      );
      return;
    }

    this.isChangingPassword = true;
    this.authService
      .changePassword(this.currentPassword, this.newPassword)
      .then(() => {
        this._snackbar.open($localize`Password changed successfully`, "OK", {
          duration: 5000,
        });
        this.currentPassword = "";
        this.newPassword = "";
        this.confirmNewPassword = "";
        this.isPasswordExpanded = false;
      })
      .catch((err) => {
        console.error("Error changing password:", err);
        let message = $localize`Error changing password. Please try again.`;
        if (err.code === "auth/wrong-password") {
          message = $localize`Current password is incorrect.`;
        } else if (err.code === "auth/weak-password") {
          message = $localize`New password is too weak.`;
        }
        this._snackbar.open(message, "OK", { duration: 5000 });
      })
      .finally(() => {
        this.isChangingPassword = false;
      });
  }

  confirmDeleteAccount() {
    this.showDeleteConfirmation = true;
  }

  cancelDeleteAccount() {
    this.showDeleteConfirmation = false;
    this.deleteAccountPassword = "";
  }

  // Helper to handle the actual deletion call
  private _performDelete(password?: string) {
    this.isDeletingAccount = true;
    this.authService
      .deleteAccount(password)
      .then(() => {
        this._snackbar.open(
          $localize`Your account has been deleted. Goodbye!`,
          "OK",
          { duration: 5000 }
        );
        this.router.navigate(["/"]);
      })
      .catch((err) => {
        console.error("Error deleting account:", err);
        let message = $localize`Error deleting account. Please try again.`;
        if (err.code === "auth/wrong-password") {
          message = $localize`Incorrect password. Please try again.`;
        } else if (err.code === "auth/requires-recent-login") {
          message = $localize`Security check failed. Please sign in again and try deleting your account.`;
        }
        this._snackbar.open(message, "OK", { duration: 5000 });
      })
      .finally(() => {
        this.isDeletingAccount = false;
        this.showDeleteConfirmation = false;
        this.deleteAccountPassword = "";
      });
  }

  deleteAccount() {
    if (this.isOAuthUser) {
      // For OAuth, we need to reauthenticate with the provider
      const providerId = this.authService.user.providerId;
      if (!providerId) return;

      this.isDeletingAccount = true;
      this.authService
        .reauthenticateWithProvider(providerId)
        .then(() => {
          // Re-auth successful, proceed to delete without password
          this._performDelete();
        })
        .catch((err) => {
          console.error("Re-authentication failed:", err);
          this.isDeletingAccount = false;
          this._snackbar.open(
            $localize`Re-authentication failed. Account not deleted.`,
            "OK",
            { duration: 5000 }
          );
        });
      return;
    }

    // Password-based user
    if (!this.deleteAccountPassword) {
      this._snackbar.open($localize`Please enter your password`, "OK", {
        duration: 3000,
      });
      return;
    }

    this._performDelete(this.deleteAccountPassword);
  }

  profileHasChanges(hasChanges: boolean) {
    this.menuPoints[0].hasChanges = hasChanges;
    this.updateChanges();
  }

  updateChanges() {
    for (let point of this.menuPoints) {
      if (point.hasChanges) {
        this.hasChanges = true;
        return;
      }
    }
    this.hasChanges = false;
  }

  miniFabPressed() {
    this.discardAllChanges();
  }

  discardAllChanges() {
    console.error("TODO Implement discarding");
  }

  saveAllChanges() {
    // Save all changes in components
    this.editProfileComponent
      ?.saveAllChanges()
      ?.then(() => {
        this._snackbar.open("Successfully saved all changes!", "Dismiss", {
          duration: 3000,
          horizontalPosition: "center",
          verticalPosition: "bottom",
        });
        this.menuPoints[0].hasChanges = false;
        this.hasChanges = false;

        // refetch all the userdata since it has changed!
        this.authService.refetchUserData();
      })
      .catch((err) => {
        console.error("Saving settings failed!", err);
        this._snackbar.open(
          "Error saving all changes! Please try again later.",
          "Dismiss",
          {
            duration: 5000,
            horizontalPosition: "center",
            verticalPosition: "bottom",
          }
        );
      });

    // Save all changes here
  }
}
