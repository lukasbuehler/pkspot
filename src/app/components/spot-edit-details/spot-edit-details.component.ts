import { Component, input } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";

@Component({
  selector: "app-spot-edit-details",
  imports: [MatButtonModule, MatIconModule],
  templateUrl: "./spot-edit-details.component.html",
  styleUrl: "./spot-edit-details.component.scss",
})
export class SpotEditDetailsComponent {
  spotEdit = input<SpotEditSchema>();
}
