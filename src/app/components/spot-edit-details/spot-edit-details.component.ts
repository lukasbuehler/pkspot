import { Component, input } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";
import { SpotEdit } from "../../../db/models/SpotEdit";
import { SpotEditSummaryComponent } from "../spot-edit-summary/spot-edit-summary.component";

@Component({
  selector: "app-spot-edit-details",
  imports: [
    MatButtonModule,
    MatIconModule,
    ProfileButtonComponent,
    SpotEditSummaryComponent,
  ],
  templateUrl: "./spot-edit-details.component.html",
  styleUrl: "./spot-edit-details.component.scss",
})
export class SpotEditDetailsComponent {
  spotEdit = input<SpotEdit>();
}
