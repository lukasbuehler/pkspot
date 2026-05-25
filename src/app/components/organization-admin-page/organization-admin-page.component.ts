import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  OrganizationDocument,
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { createUserReference } from "../../../scripts/Helpers";
import { OrganizationRole } from "../../../db/schemas/OrganizationSchema";
import { Subscription } from "rxjs";

@Component({
  selector: "app-organization-admin-page",
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: "./organization-admin-page.component.html",
  styleUrl: "./organization-admin-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationAdminPageComponent implements OnDestroy {
  private _organizationsService = inject(OrganizationsService);
  readonly authService = inject(AuthenticationService);

  readonly organizations = signal<OrganizationDocument[]>([]);
  readonly newOrgId = signal("");
  readonly newOrgName = signal("");
  readonly newOrgSlug = signal("");
  readonly newOrgLogoUrl = signal("");
  readonly newOrgLogoBackgroundColor = signal("");
  readonly selectedOrganizationId = signal("");
  readonly memberUserId = signal("");
  readonly memberRole = signal<OrganizationRole>("reviewer");
  readonly isAdmin = signal(false);
  readonly authResolved = this.authService.initialAuthStateResolved;
  private readonly _authSubscription: Subscription;
  private _hasLoadedOrganizations = false;

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      const isAdmin = this.authService.user.data?.isAdmin === true;
      this.isAdmin.set(isAdmin);
      if (isAdmin && !this._hasLoadedOrganizations) {
        this._hasLoadedOrganizations = true;
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    this.organizations.set(await this._organizationsService.getOrganizations());
  }

  async createOrganization(): Promise<void> {
    const organizationId = this.newOrgId();
    const logoUrl = this.newOrgLogoUrl().trim();
    const logoBackgroundColor = this.newOrgLogoBackgroundColor().trim();
    await this._organizationsService.createOrganization(organizationId, {
      name: this.newOrgName(),
      slug: this.newOrgSlug(),
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      ...(logoBackgroundColor
        ? { logo_background_color: logoBackgroundColor }
        : {}),
      active: true,
    });
    await this.reload();
    this.selectedOrganizationId.set(organizationId);
  }

  async addCurrentUserAsMember(): Promise<void> {
    const user = this.authService.user.data;
    const uid = this.memberUserId() || this.authService.user.uid;
    if (!user || !uid || !this.selectedOrganizationId()) return;
    await this._organizationsService.upsertMember(
      this.selectedOrganizationId(),
      uid,
      this.memberRole(),
      createUserReference(user)
    );
  }
}
