import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
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
import { Subscription } from "rxjs";
import {
  EventRSVPCountsSchema,
  EventRSVPOption,
} from "../../../db/schemas/EventRSVPSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { FancyCounterComponent } from "../fancy-counter/fancy-counter.component";

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
export class EventRsvpComponent implements OnDestroy {
  private _eventsService = inject(EventsService);
  private _authService = inject(AuthenticationService);
  private _authSubscription?: Subscription;
  private _loadVersion = 0;

  readonly eventId = input<string | null>(null);
  readonly counts = input<EventRSVPCountsSchema | null>(null);
  readonly showDisclaimer = input(true);

  readonly userId = signal<string | null>(this._authService.user.uid ?? null);
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

  constructor() {
    this._authSubscription = this._authService.authState$.subscribe((user) => {
      this.userId.set(user?.uid ?? null);
    });

    effect(() => {
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

  ngOnDestroy(): void {
    this._authSubscription?.unsubscribe();
  }

  async selectRsvp(next: EventRSVPOption): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.userId()) return;
    if (next === this.selectedRsvp()) return;

    const previousSelected = this.selectedRsvp();
    const previousLoaded = this.loadedRsvp();
    this.selectedRsvp.set(next);
    this.errorMessage.set("");
    this.isSaving.set(true);

    try {
      await this._eventsService.setMyRsvp(eventId, next);
      this.loadedRsvp.set(next);
    } catch (err) {
      console.error("Failed to save event RSVP", err);
      this.selectedRsvp.set(previousSelected);
      this.loadedRsvp.set(previousLoaded);
      this.errorMessage.set(
        $localize`:@@event_rsvp.save_failed:Couldn't save your response. Try again in a moment.`,
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  async clearRsvp(): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.userId() || !this.selectedRsvp()) return;

    const previousSelected = this.selectedRsvp();
    const previousLoaded = this.loadedRsvp();
    this.selectedRsvp.set(null);
    this.errorMessage.set("");
    this.isSaving.set(true);

    try {
      await this._eventsService.clearMyRsvp(eventId);
      this.loadedRsvp.set(null);
    } catch (err) {
      console.error("Failed to clear event RSVP", err);
      this.selectedRsvp.set(previousSelected);
      this.loadedRsvp.set(previousLoaded);
      this.errorMessage.set(
        $localize`:@@event_rsvp.clear_failed:Couldn't clear your response. Try again in a moment.`,
      );
    } finally {
      this.isSaving.set(false);
    }
  }

  private async _loadRsvp(eventId: string): Promise<void> {
    const version = ++this._loadVersion;
    this.isLoading.set(true);
    this.errorMessage.set("");
    try {
      const doc = await this._eventsService.getMyRsvp(eventId);
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
}
