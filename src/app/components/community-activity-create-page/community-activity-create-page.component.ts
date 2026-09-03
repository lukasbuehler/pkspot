import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { EVENT_COUNTRY_CODES } from "../../../db/schemas/EventGeography";
import type { Event as PkEvent } from "../../../db/models/Event";
import { AgeAssuranceService } from "../../services/age-assurance.service";
import { AnalyticsService } from "../../services/analytics.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventAuthoringService } from "../../services/event-authoring.service";
import { EventPageDataService } from "../../services/event-page/event-page-data.service";
import { MetaTagService } from "../../services/meta-tag.service";

interface CommunityEventRouteData {
  editCommunityEvent?: boolean;
}

@Component({
  selector: "app-community-event-create-page",
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: "./community-activity-create-page.component.html",
  styleUrl: "./community-activity-create-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityEventCreatePageComponent {
  private readonly _formBuilder = inject(FormBuilder).nonNullable;
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _auth = inject(AuthenticationService);
  private readonly _ageAssurance = inject(AgeAssuranceService);
  private readonly _authoring = inject(EventAuthoringService);
  private readonly _eventPageData = inject(EventPageDataService);
  private readonly _analytics = inject(AnalyticsService);
  private readonly _meta = inject(MetaTagService);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly _locale = inject(LOCALE_ID);
  private readonly _authState = toSignal(this._auth.authState$, {
    initialValue: this._auth.authState$.value,
  });

  private readonly _routeData = this._route.snapshot.data as CommunityEventRouteData;
  readonly editing = this._routeData.editCommunityEvent === true;
  readonly heading = this.editing
    ? $localize`:@@community_event.edit_heading:Edit community event`
    : $localize`:@@community_event.plan_heading:Plan a community event`;
  readonly description = $localize`:@@community_event.description:Bring your local parkour community together.`;
  readonly signedIn = computed(() => !!this._authState()?.uid);
  readonly hasVerifiedAdultEligibility = computed(() =>
    this._ageAssurance.hasVerifiedAdultEligibility(),
  );
  readonly hasPublicProfile = computed(
    () => this._auth.user.data?.data?.public_profile_enabled === true,
  );
  readonly canPublish = computed(
    () =>
      this.signedIn() &&
      this.hasVerifiedAdultEligibility() &&
      this.hasPublicProfile(),
  );
  readonly saving = signal(false);
  readonly cancelling = signal(false);
  readonly loading = signal(false);
  readonly existingEvent = signal<PkEvent | null>(null);
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  readonly countries = EVENT_COUNTRY_CODES.map((code) => ({
    code,
    label: countryName(code, this._locale),
  }));
  readonly form = this._formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(160)]],
    description: ["", [Validators.maxLength(2_000)]],
    locality: ["", [Validators.required, Validators.maxLength(160)]],
    countryCode: ["", Validators.required],
    startsAt: ["", Validators.required],
    endsAt: ["", Validators.required],
    broadcast: [false],
  });

  constructor() {
    this._meta.setStaticPageMetaTags(
      this.heading,
      this.description,
      undefined,
      this.editing
        ? `/events/${this._route.snapshot.paramMap.get("slug") ?? ""}/edit`
        : "/events/community/new",
    );
    this._meta.setRobotsContent("noindex,nofollow");
    if (this.editing) void this._loadExistingEvent();
  }

  async submit(): Promise<void> {
    if (!this.canPublish()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const startsAt = localDateTimeToIso(value.startsAt);
    const endsAt = localDateTimeToIso(value.endsAt);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      this._snackBar.open(
        $localize`:@@community_activity.invalid_times:Choose an end time after the start time.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 4_000 },
      );
      return;
    }

    this.saving.set(true);
    try {
      const eventInput = {
        name: value.name,
        ...(value.description.trim() ? { description: value.description } : {}),
        locality: value.locality,
        countryCode: value.countryCode,
        startsAt,
        endsAt,
        timeZone: this.timeZone,
        visibility: "public",
        broadcast: value.broadcast,
      } as const;
      if (this.editing) {
        const event = this.existingEvent();
        if (!event) return;
        await this._authoring.updateCommunityEvent(event.id, {
          ...eventInput,
          broadcast: false,
        });
        this._analytics.trackEvent("community_event_updated");
        this._snackBar.open(
          $localize`:@@community_event.updated:Your community event is updated.`,
          $localize`:@@common.dismiss:Dismiss`,
          { duration: 3_000 },
        );
        await this._router.navigate(["/events", event.slug ?? event.id]);
      } else {
        const result = await this._authoring.createCommunityEvent(eventInput);
        this._analytics.trackEvent("community_event_created", { broadcast: value.broadcast });
        this._snackBar.open(
          $localize`:@@community_event.created:Your community event is published.`,
          $localize`:@@common.dismiss:Dismiss`,
          { duration: 3_000 },
        );
        await this._router.navigate(["/events", result.slug]);
      }
    } catch (error) {
      console.error("Unable to create community event", error);
      this._snackBar.open(
        error instanceof Error
          ? error.message
          : $localize`:@@community_event.create_failed:Couldn't publish this community event. Please try again.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 6_000 },
      );
      this.saving.set(false);
    }
  }

  async cancelEvent(): Promise<void> {
    const event = this.existingEvent();
    if (!event || this.cancelling()) return;
    this.cancelling.set(true);
    try {
      await this._authoring.cancelCommunityEvent(event.id);
      this._snackBar.open(
        $localize`:@@community_event.cancelled:Your community event is cancelled.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 3_000 },
      );
      await this._router.navigate(["/events", event.slug ?? event.id]);
    } catch (error) {
      console.error("Unable to cancel community event", error);
      this._snackBar.open(
        error instanceof Error
          ? error.message
          : $localize`:@@community_event.cancel_failed:Couldn't cancel this community event. Please try again.`,
        $localize`:@@common.dismiss:Dismiss`,
        { duration: 6_000 },
      );
    } finally {
      this.cancelling.set(false);
    }
  }

  private async _loadExistingEvent(): Promise<void> {
    const slug = this._route.snapshot.paramMap.get("slug");
    if (!slug) return;
    this.loading.set(true);
    try {
      const event = await this._eventPageData.loadEventBySlugOrId(slug);
      if (!event || event.listingTier !== "community") {
        await this._router.navigate(["/events", slug]);
        return;
      }
      this.existingEvent.set(event);
      this.form.patchValue({
        name: event.name,
        description: event.description ?? "",
        locality: event.localityString,
        countryCode: event.countryCode ?? "",
        startsAt: toLocalDateTimeInput(event.start),
        endsAt: toLocalDateTimeInput(event.end),
        broadcast: event.communityBroadcast === "on_publish",
      });
    } catch (error) {
      console.error("Unable to load community event", error);
      await this._router.navigate(["/events", slug]);
    } finally {
      this.loading.set(false);
    }
  }
}

function localDateTimeToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function toLocalDateTimeInput(value: Date): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}
