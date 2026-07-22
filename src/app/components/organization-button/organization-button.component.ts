import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { OrganizationReferenceSchema } from "../../../db/schemas/OrganizationSchema";

@Component({
  selector: "app-organization-button",
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: "./organization-button.component.html",
  styleUrl: "./organization-button.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationButtonComponent {
  readonly organization = input.required<OrganizationReferenceSchema>();
}
