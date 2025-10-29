import { Component, OnInit, ViewChild } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router } from "@angular/router";
import { NgFor, NgClass, NgSwitch, NgSwitchCase, NgIf } from "@angular/common";
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

@Component({
  selector: "app-settings-page",
  templateUrl: "./settings-page.component.html",
  styleUrls: ["./settings-page.component.scss"],
  imports: [
    NgFor,
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
    NgIf,
    MatSuffix,
    MatTooltip,
    MatHint,
    SpeedDialFabComponent,
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
    private _snackbar: MatSnackBar
  ) {}

  menuPoints = [
    {
      id: "profile",
      name: "Public profile",
      icon: "person",
      hasChanges: false,
    },
    {
      id: "login",
      name: "Login information",
      icon: "vpn_key",
      hasChanges: false,
    },
    {
      id: "general",
      name: "General",
      icon: "settings",
      hasChanges: false,
    },
    /*
    {
      id: "notifications",
      name: "Notifications",
      icon: "notifications",
    },
    {
      id: "security-privacy",
      name: "Security & Privacy",
      icon: "security",
    },
    {
      id: "delete",
      name: "Delete Profile",
      icon: "delete",
    },
    */
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

  ngOnInit(): void {
    this.emailAddress = this.authService?.user?.email || "";
    this.authService.authState$.subscribe((user) => {
      this.emailAddress = user?.email;
    });

    let tab: string = this.route.snapshot.paramMap.get("tab") || "";
    if (tab) {
      this.openMenuPoint(tab);
    }
  }

  openMenuPoint(pointId: string) {
    // Check if this point id exists
    if (
      this.menuPoints.findIndex((menuPoint) => menuPoint.id === pointId) >= 0
    ) {
      this.selectedPoint = pointId;
      this.updateURL(pointId);
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
    //this.authService.changeEmailAddress()
    // TODO
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
