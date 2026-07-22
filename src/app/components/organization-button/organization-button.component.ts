import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { RouterLink } from "@angular/router";
import { OrganizationReferenceSchema } from "../../../db/schemas/OrganizationSchema";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";

@Component({
  selector: "app-organization-button",
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: "./organization-button.component.html",
  styleUrl: "./organization-button.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationButtonComponent {
  private readonly organizationsService = inject(OrganizationsService);

  readonly organization = input.required<OrganizationReferenceSchema>();

  readonly organizationResource = resource({
    params: () => this.organization().id,
    loader: async ({ params: organizationId }) => {
      try {
        return await this.organizationsService.getOrganizationById(
          organizationId,
        );
      } catch (error) {
        console.warn("Could not load organization button details", error);
        return null;
      }
    },
  });

  readonly displayOrganization = computed<OrganizationReferenceSchema>(() => {
    const reference = this.organization();
    const document = this.organizationResource.value();
    if (!document) return reference;

    return {
      id: document.id,
      name: document.name,
      slug: document.slug,
      logo_url: document.logo_url ?? reference.logo_url,
      logo_background_color:
        document.logo_background_color ?? reference.logo_background_color,
    };
  });
}
