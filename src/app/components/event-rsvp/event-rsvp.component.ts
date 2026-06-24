import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import {
  EventRSVPCountsSchema,
  EventRSVPOption,
} from "../../../db/schemas/EventRSVPSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";
import { AnalyticsService } from "../../services/analytics.service";

@Component({
  selector: "app-event-rsvp",
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
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
  private _analytics = inject(AnalyticsService);
  private _loadVersion = 0;

  readonly eventId = input<string | null>(null);
  readonly counts = input<EventRSVPCountsSchema | null>(null);
  readonly showDisclaimer = input(true);
  readonly preview = input(false);

  readonly userId = signal<string | null>(null);
  readonly selectedRsvp = signal<EventRSVPOption | null>(null);
  readonly loadedRsvp = signal<EventRSVPOption | null>(null);
  readonly isLoading = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal("");

  readonly isSignedIn = computed(() => !!this.userId());
  readonly displayCounts = computed(() => {
    const base = this.counts() ?? {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    };
    return base;
  });

  hasNumbers = computed(() => {
    return (
      this.displayCounts().going > 0 || this.displayCounts().interested > 0
    );
  });

  constructor() {
    effect((onCleanup) => {
      if (this.preview()) {
        this.userId.set(null);
        this.selectedRsvp.set(null);
        this.loadedRsvp.set(null);
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
    this._analytics.trackEvent("event_rsvp_selected", {
      event_id: eventId,
      rsvp: next,
      previous_rsvp: previousSelected,
      was_loaded_rsvp: previousLoaded === next,
    });
    this.selectedRsvp.set(next);
    this.errorMessage.set("");
    this.isSaving.set(true);

    try {
      await this._events().setMyRsvp(eventId, next);
      this.loadedRsvp.set(next);
      this._analytics.trackEvent("event_rsvp_saved", {
        event_id: eventId,
        rsvp: next,
      });
    } catch (err) {
      console.error("Failed to save event RSVP", err);
      this.selectedRsvp.set(previousSelected);
      this.loadedRsvp.set(previousLoaded);
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

  async clearRsvp(): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.userId() || !this.selectedRsvp()) return;

    const previousSelected = this.selectedRsvp();
    const previousLoaded = this.loadedRsvp();
    this._analytics.trackEvent("event_rsvp_clear_clicked", {
      event_id: eventId,
      previous_rsvp: previousSelected,
    });
    this.selectedRsvp.set(null);
    this.errorMessage.set("");
    this.isSaving.set(true);

    try {
      await this._events().clearMyRsvp(eventId);
      this.loadedRsvp.set(null);
      this._analytics.trackEvent("event_rsvp_cleared", {
        event_id: eventId,
        previous_rsvp: previousLoaded,
      });
    } catch (err) {
      console.error("Failed to clear event RSVP", err);
      this.selectedRsvp.set(previousSelected);
      this.loadedRsvp.set(previousLoaded);
      this.errorMessage.set(
        $localize`:@@event_rsvp.clear_failed:Couldn't clear your response. Try again in a moment.`,
      );
      this._analytics.trackEvent("event_rsvp_clear_failed", {
        event_id: eventId,
        previous_rsvp: previousLoaded,
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

  private _events(): EventsService {
    this._eventsService ??= this._injector.get(EventsService);
    return this._eventsService;
  }

  private _auth(): AuthenticationService {
    this._authService ??= this._injector.get(AuthenticationService);
    return this._authService;
  }
}
