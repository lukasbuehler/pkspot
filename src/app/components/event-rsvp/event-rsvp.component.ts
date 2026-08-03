import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import {
  EventRSVPCountsSchema,
  EventRSVPOption,
} from "../../../db/schemas/EventRSVPSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";
import { AnalyticsService } from "../../services/analytics.service";
import type { EventNotificationLevel } from "../../../db/schemas/EventLiveUpdateSchema";
import { MyEventsService } from "../../services/my-events.service";
import { NotificationOptInService } from "../../services/notification-opt-in.service";

type ScreenshotGlobal = typeof globalThis & {
  __PKSPOT_SCREENSHOT_EVENT_RSVPS__?: unknown;
};

@Component({
  selector: "app-event-rsvp",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    FancyCounterComponent,
  ],
  templateUrl: "./event-rsvp.component.html",
  styleUrl: "./event-rsvp.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRsvpComponent {
  private _injector = inject(Injector);
  private _eventsService?: EventsService;
  private _authService?: AuthenticationService;
  private _myEventsService?: MyEventsService;
  private _notificationOptInService?: NotificationOptInService;
  private _analytics = inject(AnalyticsService);
  private _loadVersion = 0;

  readonly eventId = input<string | null>(null);
  readonly defaultNotificationLevel = input<EventNotificationLevel>("all");
  readonly counts = input<EventRSVPCountsSchema | null>(null);
  readonly showDisclaimer = input(true);
  readonly preview = input(false);
  readonly rsvpChanged = output<EventRSVPOption | null>();

  readonly userId = signal<string | null>(null);
  readonly selectedRsvp = signal<EventRSVPOption | null>(null);
  readonly loadedRsvp = signal<EventRSVPOption | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly relationshipFallbackSuppressed = signal(false);
  readonly errorMessage = signal("");
  readonly disclaimerText = $localize`:@@event_rsvp.disclaimer:These numbers show PK Spot user intent, not tickets bought.`;
  readonly addLabel = $localize`:@@event_rsvp.add_to_my_events:Add to My Events`;
  readonly changeLabel = $localize`:@@event_rsvp.change_my_event_status:Change My Events status`;

  readonly isSignedIn = computed(() => !!this.userId());
  readonly myEventsRsvp = computed<"going" | "interested" | null>(() => {
    if (this.preview()) return null;
    const selected = this.selectedRsvp();
    if (selected === "going" || selected === "interested") return selected;
    if (this.relationshipFallbackSuppressed()) return null;
    const eventId = this.eventId();
    if (!eventId) return null;
    const relationship = this._myEvents().relationshipFor(eventId);
    return relationship === "going"
      ? "going"
      : relationship === "saved"
        ? "interested"
        : null;
  });
  readonly displayCounts = computed(() => {
    const base = this.counts() ?? {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    };
    return base;
  });

  constructor() {
    effect((onCleanup) => {
      if (this.preview()) {
        this.userId.set(null);
        this.selectedRsvp.set(null);
        this.loadedRsvp.set(null);
        this.relationshipFallbackSuppressed.set(false);
        this.rsvpChanged.emit(null);
        return;
      }

      const authService = this._auth();
      this.userId.set(authService.user.uid ?? null);
      const authSubscription = authService.authState$.subscribe((user) => {
        this.userId.set(user?.uid ?? null);
      });
      onCleanup(() => authSubscription.unsubscribe());
    });

    effect(() => {
      if (this.preview()) return;
      const eventId = this.eventId();
      const userId = this.userId();
      if (!eventId || !userId) {
        this.selectedRsvp.set(null);
        this.loadedRsvp.set(null);
        this.relationshipFallbackSuppressed.set(false);
        this.rsvpChanged.emit(null);
        return;
      }

      const screenshotRsvp = this._readScreenshotRsvp(eventId);
      if (screenshotRsvp !== undefined) {
        this.selectedRsvp.set(screenshotRsvp);
        this.loadedRsvp.set(screenshotRsvp);
        this.relationshipFallbackSuppressed.set(false);
        this.rsvpChanged.emit(screenshotRsvp);
        this.errorMessage.set("");
        return;
      }

      void this._loadRsvp(eventId);
    });
  }

  async selectRsvp(next: EventRSVPOption): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.userId()) return;
    if (next === this.selectedRsvp()) return;

    const previousSelected = this.selectedRsvp();
    const previousLoaded = this.loadedRsvp();
    let notificationLevel = this.defaultNotificationLevel();
    if (
      (next === "going" || next === "interested") &&
      previousLoaded !== "going" &&
      previousLoaded !== "interested"
    ) {
      const prompt = await this._notificationOptIn().maybePrompt("event_reminders");
      if (prompt === "dismissed") notificationLevel = "none";
      if (prompt === "context") notificationLevel = "reminders";
    }
    this._analytics.trackEvent("event_rsvp_selected", {
      event_id: eventId,
      rsvp: next,
      previous_rsvp: previousSelected,
      was_loaded_rsvp: previousLoaded === next,
    });
    this.relationshipFallbackSuppressed.set(false);
    this.selectedRsvp.set(next);
    this.rsvpChanged.emit(next);
    this.errorMessage.set("");
    this.isSaving.set(true);

    try {
      await this._myEvents().setRsvp(
        eventId,
        next,
        notificationLevel,
      );
      this.loadedRsvp.set(next);
      this._analytics.trackEvent("event_rsvp_saved", {
        event_id: eventId,
        rsvp: next,
      });
    } catch (err) {
      console.error("Failed to save event RSVP", err);
      this.selectedRsvp.set(previousSelected);
      this.loadedRsvp.set(previousLoaded);
      this.rsvpChanged.emit(previousSelected);
      this.errorMessage.set(
        $localize`:@@event_rsvp.save_failed:Couldn't save your response. Try again in a moment.`,
      );
      this._analytics.trackEvent("event_rsvp_save_failed", {
        event_id: eventId,
        rsvp: next,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  async selectInterested(): Promise<void> {
    if (this.isSignedIn()) {
      await this.selectRsvp("interested");
      return;
    }

    const eventId = this.eventId();
    if (!eventId || this.isSaving()) return;
    this._analytics.trackEvent("event_rsvp_selected", {
      event_id: eventId,
      rsvp: "interested",
      previous_rsvp: this.myEventsRsvp(),
      was_loaded_rsvp: false,
    });
    this.errorMessage.set("");
    this.isSaving.set(true);
    try {
      await this._myEvents().saveEvent(
        eventId,
        this.defaultNotificationLevel(),
      );
      this.rsvpChanged.emit("interested");
      this._analytics.trackEvent("event_rsvp_saved", {
        event_id: eventId,
        rsvp: "interested",
        storage: "device",
      });
    } catch (err) {
      console.error("Failed to save event locally", err);
      this.errorMessage.set(
        $localize`:@@event_rsvp.save_failed:Couldn't save your response. Try again in a moment.`,
      );
      this._analytics.trackEvent("event_rsvp_save_failed", {
        event_id: eventId,
        rsvp: "interested",
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  async clearRsvp(): Promise<void> {
    const eventId = this.eventId();
    const previousRelationship = this.myEventsRsvp();
    if (!eventId || !previousRelationship) return;

    const previousSelected = this.selectedRsvp();
    const previousLoaded = this.loadedRsvp();
    this._analytics.trackEvent("event_rsvp_clear_clicked", {
      event_id: eventId,
      previous_rsvp: previousRelationship,
    });
    this.relationshipFallbackSuppressed.set(true);
    this.selectedRsvp.set(null);
    this.rsvpChanged.emit(null);
    this.errorMessage.set("");
    this.isSaving.set(true);

    try {
      await this._myEvents().clearRsvp(eventId);
      this.loadedRsvp.set(null);
      this._analytics.trackEvent("event_rsvp_cleared", {
        event_id: eventId,
        previous_rsvp: previousRelationship,
      });
    } catch (err) {
      console.error("Failed to clear event RSVP", err);
      this.selectedRsvp.set(previousSelected);
      this.loadedRsvp.set(previousLoaded);
      this.relationshipFallbackSuppressed.set(false);
      this.rsvpChanged.emit(previousRelationship);
      this.errorMessage.set(
        $localize`:@@event_rsvp.clear_failed:Couldn't clear your response. Try again in a moment.`,
      );
      this._analytics.trackEvent("event_rsvp_clear_failed", {
        event_id: eventId,
        previous_rsvp: previousRelationship,
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  trackRsvpMenuOpened(): void {
    const eventId = this.eventId();
    if (!eventId) {
      return;
    }

    this._analytics.trackEvent("event_rsvp_menu_opened", {
      event_id: eventId,
      current_rsvp: this.selectedRsvp(),
    });
  }

  trackRsvpSignInClicked(): void {
    const eventId = this.eventId();
    if (!eventId) {
      return;
    }

    this._analytics.trackEvent("event_rsvp_sign_in_clicked", {
      event_id: eventId,
    });
  }

  private async _loadRsvp(eventId: string): Promise<void> {
    const version = ++this._loadVersion;
    this.isLoading.set(true);
    this.errorMessage.set("");
    try {
      const doc = await this._events().getMyRsvp(eventId);
      if (version !== this._loadVersion) return;
      const rsvp = this._normalizeRsvp(doc?.rsvp);
      this.loadedRsvp.set(rsvp);
      this.selectedRsvp.set(rsvp);
      this.relationshipFallbackSuppressed.set(false);
      this.rsvpChanged.emit(rsvp);
    } catch (err) {
      if (version !== this._loadVersion) return;
      console.error("Failed to load event RSVP", err);
      this.errorMessage.set(
        $localize`:@@event_rsvp.load_failed:Couldn't load your response.`,
      );
    } finally {
      if (version === this._loadVersion) {
        this.isLoading.set(false);
      }
    }
  }

  private _normalizeRsvp(value: unknown): EventRSVPOption | null {
    return value === "going" || value === "interested" || value === "notgoing"
      ? value
      : null;
  }

  private _readScreenshotRsvp(
    eventId: string,
  ): EventRSVPOption | null | undefined {
    const candidate = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_EVENT_RSVPS__;
    if (!candidate || typeof candidate !== "object") {
      return undefined;
    }

    const rsvp = (candidate as Record<string, unknown>)[eventId];
    if (rsvp === null) {
      return null;
    }

    const normalized = this._normalizeRsvp(rsvp);
    return normalized ?? undefined;
  }

  private _events(): EventsService {
    this._eventsService ??= this._injector.get(EventsService);
    return this._eventsService;
  }

  private _auth(): AuthenticationService {
    this._authService ??= this._injector.get(AuthenticationService);
    return this._authService;
  }

  private _myEvents(): MyEventsService {
    this._myEventsService ??= this._injector.get(MyEventsService);
    return this._myEventsService;
  }

  private _notificationOptIn(): NotificationOptInService {
    this._notificationOptInService ??=
      this._injector.get(NotificationOptInService);
    return this._notificationOptInService;
  }
}
