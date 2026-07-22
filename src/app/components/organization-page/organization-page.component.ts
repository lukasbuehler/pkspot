import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  LOCALE_ID,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Spot } from "../../../db/models/Spot";
import { Event as PkEvent } from "../../../db/models/Event";
import { LocaleCode } from "../../../db/models/Interfaces";
import { OrganizationMemberSchema } from "../../../db/schemas/OrganizationSchema";
import {
  OrganizationDocument,
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { EventCardComponent } from "../event-card/event-card.component";

@Component({
  selector: "app-organization-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    EventCardComponent,
    SpotPreviewCardComponent,
  ],
  templateUrl: "./organization-page.component.html",
  styleUrl: "./organization-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationPageComponent implements OnInit {
  private readonly _route = inject(ActivatedRoute);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _authService = inject(AuthenticationService);
  private readonly _organizationsService = inject(OrganizationsService);
  private readonly _eventsService = inject(EventsService);
  private readonly _locale = inject<LocaleCode>(LOCALE_ID);
  private readonly _analytics = inject(AnalyticsService);

  readonly organization = signal<OrganizationDocument | null>(null);
  readonly members = signal<(OrganizationMemberSchema & { id: string })[]>([]);
  readonly events = signal<PkEvent[]>([]);
  readonly stewardedSpots = signal<Spot[]>([]);
  readonly managedSpots = signal<Spot[]>([]);
  readonly usedSpots = signal<Spot[]>([]);
  readonly isLoading = signal(true);
  readonly isMembersLoading = signal(false);
  readonly canViewMembers = signal(false);
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
  readonly eventCount = computed(() => this.events().length);
  readonly stewardedSpotCount = computed(() => this.stewardedSpots().length);
  readonly managedSpotCount = computed(() => this.managedSpots().length);
  readonly usedSpotCount = computed(() => this.usedSpots().length);

  ngOnInit(): void {
    this._authService.authState$
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((user) => {
        this.canViewMembers.set(false);
        this.members.set([]);
        this.isMembersLoading.set(false);

        const organization = this.organization();
        if (organization && user?.uid) {
          void this.loadOrganizationMembers(organization.id, user.uid);
        }
      });

    this._route.paramMap
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((params) => {
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
    this.canViewMembers.set(false);
    this.events.set([]);
    this.stewardedSpots.set([]);
    this.managedSpots.set([]);
    this.usedSpots.set([]);

    try {
      const organization =
        await this._organizationsService.getOrganizationBySlugOrId(slugOrId);
      if (!organization) {
        this.errorMessage.set($localize`Organization not found.`);
        return;
      }

      this.organization.set(organization);
      const userId = this._authService.authState$.getValue()?.uid;
      if (userId) {
        void this.loadOrganizationMembers(organization.id, userId);
      }
      const [events, stewardedSpots, managedSpots, usedSpots] =
        await Promise.all([
          this._eventsService.getEventsForOrganization(organization.id),
          this._organizationsService.getStewardedSpots(
            organization.id,
            this._locale
          ),
          this._organizationsService.getManagedSpots(
            organization.id,
            this._locale
          ),
          this._organizationsService.getUsedSpots(organization.id, this._locale),
        ]);
      this.events.set(events);
      this.stewardedSpots.set(stewardedSpots);
      this.managedSpots.set(managedSpots);
      this.usedSpots.set(usedSpots);
    } catch (error) {
      console.error("Failed to load organization page", error);
      this.errorMessage.set($localize`Could not load this organization.`);
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadOrganizationMembers(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    this.isMembersLoading.set(true);
    try {
      const canViewMembers =
        this._authService.isAdmin() ||
        !!(await this._organizationsService.getOrganizationMember(
          organizationId,
          userId,
        ));
      if (
        this.organization()?.id !== organizationId ||
        this._authService.authState$.getValue()?.uid !== userId
      ) {
        return;
      }
      this.canViewMembers.set(canViewMembers);
      if (!canViewMembers) {
        return;
      }

      const members =
        await this._organizationsService.getOrganizationMembers(organizationId);
      if (
        this.organization()?.id === organizationId &&
        this._authService.authState$.getValue()?.uid === userId
      ) {
        this.members.set(members);
      }
    } catch (error) {
      console.warn("Failed to load private organization members", error);
      if (
        this.organization()?.id === organizationId &&
        this._authService.authState$.getValue()?.uid === userId
      ) {
        this.canViewMembers.set(false);
        this.members.set([]);
      }
    } finally {
      if (this.organization()?.id === organizationId) {
        this.isMembersLoading.set(false);
      }
    }
  }

  trackOrganizationWebsiteClick(): void {
    const organization = this.organization();
    if (!organization?.website_url) {
      return;
    }

    this._analytics.trackOutboundLinkClick(
      "organization_page",
      "organization_website",
      organization.website_url,
      "Website",
      this._organizationAnalyticsProperties(),
    );
  }

  trackOrganizationSpotClick(
    spot: Spot,
    relationship: "stewarded" | "managed" | "used",
  ): void {
    this._analytics.trackEvent("organization_spot_clicked", {
      ...this._organizationAnalyticsProperties(),
      relationship,
      spot_id: spot.id,
      spot_slug: spot.slug ?? null,
      spot_name: spot.name(),
    });
  }

  trackOrganizationMemberClick(
    member: OrganizationMemberSchema & { id: string },
  ): void {
    this._analytics.trackEvent("organization_member_clicked", {
      ...this._organizationAnalyticsProperties(),
      member_id: member.id,
      user_id: member.user.uid,
      role: member.role,
    });
  }

  private _organizationAnalyticsProperties(): Record<string, unknown> {
    const organization = this.organization();
    return {
      organization_id: organization?.id ?? null,
      organization_slug: organization?.slug ?? null,
      organization_name: organization?.name ?? null,
    };
  }
}
