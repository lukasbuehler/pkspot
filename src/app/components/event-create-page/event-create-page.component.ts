import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Router, RouterLink } from "@angular/router";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { MetaTagService } from "../../services/meta-tag.service";
import {
  EventEditFormComponent,
  EventEditPatch,
} from "../event-edit-form/event-edit-form.component";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { EventAuthoringService } from "../../services/event-authoring.service";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import type { EventId } from "../../../db/schemas/EventSchema";

/**
 * Standalone create page at `/events/new`. Hosts the shared
 * EventEditFormComponent in create mode. Non-admins get a friendly
 * "admins only" message rather than an empty form — the rules layer
 * also rejects the write, but failing-fast here is nicer UX.
 */
@Component({
  selector: "app-event-create-page",
  templateUrl: "./event-create-page.component.html",
  styleUrl: "./event-create-page.component.scss",
  imports: [
    EventEditFormComponent,
    MatButtonModule,
    MatIconModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventCreatePageComponent implements OnInit {
  private _authService = inject(AuthenticationService);
  private _eventsService = inject(EventsService);
  private _organizationsService = inject(OrganizationsService);
  private _authoring = inject(EventAuthoringService);
  private _ageAssurance = inject(AgeAssuranceService);
  private _router = inject(Router);
  private _snackbar = inject(MatSnackBar);
  private _metaTagService = inject(MetaTagService);

  readonly isAdmin = computed(() => this._authService.isAdmin());
  readonly managedOrganizationIds = signal<ReadonlySet<string>>(new Set());
  readonly organizationEligibilityLoading = signal(true);
  readonly canCreateFormalEvent = computed(
    () =>
      this._ageAssurance.hasVerifiedAdultEligibility() &&
      (this.isAdmin() || this.managedOrganizationIds().size > 0),
  );

  readonly saving = signal<boolean>(false);

  ngOnInit(): void {
    this._metaTagService.setStaticPageMetaTags(
      $localize`:@@event_create.meta.title:Create event`,
      $localize`:@@event_create.meta.description:Admin tool for adding a new parkour event to PK Spot.`,
      undefined,
      "/events/new"
    );
    this._metaTagService.setRobotsContent("noindex,nofollow");
    void this._loadFormalEventEligibility();
  }

  async onSave(patch: EventEditPatch): Promise<void> {
    if (!this.canCreateFormalEvent()) return;
    const ownerId = this._authService.user.uid;
    if (!ownerId) {
      this._snackbar.open(
        $localize`:@@event_create.snackbar.owner_required:Sign in again before creating an event.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5000 }
      );
      return;
    }
    const organizationId =
      patch.organizer?.type === "organization"
        ? patch.organizer.organization.id
        : undefined;
    if (!this.isAdmin() && (!organizationId || !this.managedOrganizationIds().has(organizationId))) {
      this._snackbar.open(
        $localize`:@@event_create.snackbar.organization_required:Choose an organization you own or administer before creating an Event.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5_000 },
      );
      return;
    }
    const start = dateTimeToIso(patch.start);
    const end = dateTimeToIso(patch.end);
    if (!start || !end) {
      this._snackbar.open(
        $localize`:@@event_create.snackbar.times_required:Enter an exact start and end time before creating the event.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5_000 },
      );
      return;
    }
    this.saving.set(true);
    try {
      const created = await this._authoring.createFormalEvent({
        name: patch.name ?? "",
        ...(englishDescription(patch.description_i18n)
          ? { description: englishDescription(patch.description_i18n) }
          : {}),
        ...(patch.locality_string ? { locality: patch.locality_string } : {}),
        startsAt: start,
        endsAt: end,
        ...(patch.time_zone ? { timeZone: patch.time_zone } : {}),
        ...(patch.organizer_name ? { organizerName: patch.organizer_name } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(patch.banner_src ? { coverImageUrl: patch.banner_src } : {}),
      });
      // Ownership and slug creation are server-authoritative. The editor can
      // still supply the rest of the mature Event fields afterwards.
      const formalPatch = { ...patch };
      delete formalPatch.owner;
      delete formalPatch.slug;
      delete formalPatch.initialCollaboratorIds;
      await this._eventsService.updateEvent(created.eventId as EventId, formalPatch);
      this._snackbar.open(
        $localize`:@@event_create.snackbar.created:Event created.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 3000 }
      );
      // Land on the new event's detail page.
      this._router.navigate(["/events", created.slug]);
    } catch (err) {
      console.error("Failed to create event", err);
      this._snackbar.open(
        $localize`:@@event_create.snackbar.failed:Couldn't create the event. Check the console for details.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 5000 }
      );
      this.saving.set(false);
    }
  }

  onCancel(): void {
    this._router.navigate(["/events"]);
  }

  private async _loadFormalEventEligibility(): Promise<void> {
    try {
      const organizations = await this._organizationsService.getManagerOrganizations();
      this.managedOrganizationIds.set(new Set(organizations.map((organization) => organization.id)));
    } catch (error) {
      console.warn("Unable to load managed organizations for Event authoring", error);
      this.managedOrganizationIds.set(new Set());
    } finally {
      this.organizationEligibilityLoading.set(false);
    }
  }
}

function dateTimeToIso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : undefined;
  }
  return undefined;
}

function englishDescription(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("en" in value) || typeof value.en !== "string") {
    return undefined;
  }
  return value.en.trim() || undefined;
}
