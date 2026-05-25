import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Spot } from "../../../db/models/Spot";
import { LocaleCode } from "../../../db/models/Interfaces";
import { OrganizationMemberSchema } from "../../../db/schemas/OrganizationSchema";
import {
  OrganizationDocument,
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

@Component({
  selector: "app-organization-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SpotPreviewCardComponent,
  ],
  templateUrl: "./organization-page.component.html",
  styleUrl: "./organization-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationPageComponent implements OnInit {
  private readonly _route = inject(ActivatedRoute);
  private readonly _organizationsService = inject(OrganizationsService);
  private readonly _locale = inject<LocaleCode>(LOCALE_ID);

  readonly organization = signal<OrganizationDocument | null>(null);
  readonly members = signal<(OrganizationMemberSchema & { id: string })[]>([]);
  readonly verifiedSpots = signal<Spot[]>([]);
  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly logoBackground = computed(
    () =>
      this.organization()?.logo_background_color ||
      "var(--mat-sys-secondary-container)"
  );

  readonly organizationInitial = computed(
    () => this.organization()?.name.trim().charAt(0).toUpperCase() || "?"
  );
  readonly memberCount = computed(() => this.members().length);
  readonly verifiedSpotCount = computed(() => this.verifiedSpots().length);

  ngOnInit(): void {
    this._route.paramMap.subscribe((params) => {
      const slugOrId = params.get("slugOrId");
      if (!slugOrId) {
        this.errorMessage.set($localize`Organization not found.`);
        this.isLoading.set(false);
        return;
      }
      void this.loadOrganization(slugOrId);
    });
  }

  async loadOrganization(slugOrId: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.organization.set(null);
    this.members.set([]);
    this.verifiedSpots.set([]);

    try {
      const organization =
        await this._organizationsService.getOrganizationBySlugOrId(slugOrId);
      if (!organization) {
        this.errorMessage.set($localize`Organization not found.`);
        return;
      }

      this.organization.set(organization);
      const [members, verifiedSpots] = await Promise.all([
        this._organizationsService.getOrganizationMembers(organization.id),
        this._organizationsService.getVerifiedSpots(organization.id, this._locale),
      ]);
      this.members.set(members);
      this.verifiedSpots.set(verifiedSpots);
    } catch (error) {
      console.error("Failed to load organization page", error);
      this.errorMessage.set($localize`Could not load this organization.`);
    } finally {
      this.isLoading.set(false);
    }
  }
}
