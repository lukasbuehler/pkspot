import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import {
  MatButtonToggleChange,
  MatButtonToggleModule,
} from "@angular/material/button-toggle";
import { MatIconModule } from "@angular/material/icon";
import { Subscription } from "rxjs";
import {
  EventRSVPCountsSchema,
  EventRSVPOption,
} from "../../../db/schemas/EventRSVPSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";

@Component({
  selector: "app-event-rsvp",
  imports: [RouterLink, MatButtonModule, MatButtonToggleModule, MatIconModule],
  templateUrl: "./event-rsvp.component.html",
  styleUrl: "./event-rsvp.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventRsvpComponent implements OnDestroy {
  private _eventsService = inject(EventsService);
  private _authService = inject(AuthenticationService);
  private _authSubscription?: Subscription;
  private _loadVersion = 0;
  private _lastCountsValue: EventRSVPCountsSchema | null | undefined;

  readonly eventId = input<string | null>(null);
  readonly counts = input<EventRSVPCountsSchema | null>(null);

  readonly userId = signal<string | null>(this._authService.user.uid ?? null);
  readonly selectedRsvp = signal<EventRSVPOption | null>(null);
  readonly loadedRsvp = signal<EventRSVPOption | null>(null);
  readonly countedRsvp = signal<EventRSVPOption | null>(null);
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
    const current = this.selectedRsvp();
    const counted = this.countedRsvp();
    if (current === counted) return base;

    const next = { ...base };
    if (counted) {
      next[counted] = Math.max(0, next[counted] - 1);
      next.total = Math.max(0, next.total - 1);
    }
    if (current) {
      next[current] += 1;
      next.total += 1;
    }
    return next;
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
        this.countedRsvp.set(null);
        return;
      }
      void this._loadRsvp(eventId);
    });

    effect(() => {
      const counts = this.counts();
      if (counts === this._lastCountsValue) return;
      this._lastCountsValue = counts;
      this.countedRsvp.set(
        this._rsvpAlreadyCounted(untracked(() => this.loadedRsvp()), counts),
      );
    });
  }

  ngOnDestroy(): void {
    this._authSubscription?.unsubscribe();
  }

  async onRsvpChange(change: MatButtonToggleChange): Promise<void> {
    const eventId = this.eventId();
    if (!eventId || !this.userId()) return;

    const next = this._normalizeRsvp(change.value);
    if (!next || next === this.selectedRsvp()) return;

    const previousSelected = this.selectedRsvp();
    const previousLoaded = this.loadedRsvp();
    const previousCounted = this.countedRsvp();
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
      this.countedRsvp.set(previousCounted);
      this.errorMessage.set(
        $localize`:@@event_rsvp.save_failed:Couldn't save your RSVP. Try again in a moment.`,
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
    const previousCounted = this.countedRsvp();
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
      this.countedRsvp.set(previousCounted);
      this.errorMessage.set(
        $localize`:@@event_rsvp.clear_failed:Couldn't clear your RSVP. Try again in a moment.`,
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
      this.countedRsvp.set(this._rsvpAlreadyCounted(rsvp, this.counts()));
    } catch (err) {
      if (version !== this._loadVersion) return;
      console.error("Failed to load event RSVP", err);
      this.errorMessage.set(
        $localize`:@@event_rsvp.load_failed:Couldn't load your RSVP.`,
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

  private _rsvpAlreadyCounted(
    rsvp: EventRSVPOption | null,
    counts: EventRSVPCountsSchema | null,
  ): EventRSVPOption | null {
    if (!rsvp || !counts) return null;
    return counts[rsvp] > 0 ? rsvp : null;
  }
}
