import { Component, input } from "@angular/core";
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
  user = input<UserReferenceSchema | null | undefined>();
}
