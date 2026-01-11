import { Component, input, inject, computed } from "@angular/core";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { RouterLink } from "@angular/router";
import { NgOptimizedImage } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-profile-button",
  imports: [RouterLink, NgOptimizedImage, MatButtonModule, MatIconModule],
  templateUrl: "./profile-button.component.html",
  styleUrl: "./profile-button.component.scss",
})
export class ProfileButtonComponent {
  private _authService = inject(AuthenticationService);
  user = input<UserReferenceSchema | null | undefined>();

  displayUser = computed(() => {
    const u = this.user();
    if (!u) return null;

    const blockedUsers =
      this._authService.user?.data?.data?.blocked_users || [];
    if (blockedUsers.includes(u.uid)) {
      return {
        ...u,
        display_name: "Blocked User",
        profile_picture: "",
      };
    }
    return u;
  });
}
