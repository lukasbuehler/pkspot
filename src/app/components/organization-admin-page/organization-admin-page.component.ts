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
import { MatSelectModule } from "@angular/material/select";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { createUserReference } from "../../../scripts/Helpers";
import {
  OrganizationRole,
  OrganizationSchema,
} from "../../../db/schemas/OrganizationSchema";
import { Subscription } from "rxjs";

type OrganizationDocument = OrganizationSchema & { id: string };

@Component({
  selector: "app-organization-admin-page",
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
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
  readonly selectedOrganizationId = signal("");
  readonly memberUserId = signal("");
  readonly memberRole = signal<OrganizationRole>("reviewer");
  readonly spotId = signal("");
  readonly isAdmin = signal(false);
  readonly authResolved = this.authService.initialAuthStateResolved;
  private readonly _authSubscription: Subscription;

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      this.isAdmin.set(this.authService.user.data?.isAdmin === true);
    });
    void this.reload();
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    this.organizations.set(await this._organizationsService.getOrganizations());
  }

  async createOrganization(): Promise<void> {
    await this._organizationsService.createOrganization(this.newOrgId(), {
      name: this.newOrgName(),
      slug: this.newOrgSlug(),
      active: true,
    });
    await this.reload();
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

  async verifySpot(): Promise<void> {
    if (!this.spotId() || !this.selectedOrganizationId()) return;
    await this._organizationsService.setSpotVerification(
      this.spotId(),
      this.selectedOrganizationId()
    );
  }

  async removeVerification(): Promise<void> {
    if (!this.spotId()) return;
    await this._organizationsService.setSpotVerification(this.spotId(), null);
  }
}
