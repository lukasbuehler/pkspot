import { Component, computed, input } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { KeyValuePipe } from "@angular/common";
import { Timestamp } from "firebase/firestore";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";
import { SpotEdit } from "../../../db/models/SpotEdit";

@Component({
  selector: "app-spot-edit-details",
  imports: [
    MatButtonModule,
    MatIconModule,
    KeyValuePipe,
    ProfileButtonComponent,
  ],
  templateUrl: "./spot-edit-details.component.html",
  styleUrl: "./spot-edit-details.component.scss",
})
export class SpotEditDetailsComponent {
  spotEdit = input<SpotEdit>();
}
