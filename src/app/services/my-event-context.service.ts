import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom, from, of } from "rxjs";
import { catchError, switchMap, take } from "rxjs/operators";
import { Event as PkEvent } from "../../db/models/Event";
import type { EventId, EventSchema } from "../../db/schemas/EventSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { EventsService } from "./firebase/firestore/events.service";
import { EventLiveUpdatesService } from "./firebase/firestore/event-live-updates.service";
import { EventRegistrationsService } from "./firebase/firestore/event-registrations.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_ATTENDED_EVENTS__?: (EventSchema & { id: string })[];
}

@Injectable({ providedIn: "root" })
export class MyEventContextService {
  private readonly _auth = inject(AuthenticationService);
  private readonly _events = inject(EventsService);
  private readonly _liveUpdates = inject(EventLiveUpdatesService);
  private readonly _registrations = inject(EventRegistrationsService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _now = signal(new Date());

  readonly now = this._now.asReadonly();
  readonly attendedEvents = toSignal(
    this._auth.authState$.pipe(
      switchMap((user) =>
        user?.uid && this._isBrowser
          ? this._screenshotAttendedEvents() ??
            this._liveUpdates.observeCurrentUserSubscriptions().pipe(
              switchMap((subscriptions) =>
                from(
                  this._resolveAttendedEvents(
                    subscriptions.map(({ eventId }) => eventId),
                  ),
                ),
              ),
            )
          : of([] as PkEvent[]),
      ),
      catchError((error) => {
        console.warn("Could not load the current user's attended events", error);
        return of([]);
      }),
    ),
    { initialValue: [] as PkEvent[] },
  );
  readonly liveEvents = computed(() =>
    this.attendedEvents()
      .filter((event) => event.isLive(this.now()))
      .sort((left, right) => left.end.getTime() - right.end.getTime()),
  );
  readonly hasLiveEvent = computed(() => this.liveEvents().length > 0);

  constructor() {
    if (!this._isBrowser) return;
    const interval = window.setInterval(() => this._now.set(new Date()), 60_000);
    this._destroyRef.onDestroy(() => window.clearInterval(interval));
  }

  private async _resolveAttendedEvents(
    eventIds: readonly string[],
  ): Promise<PkEvent[]> {
    const uniqueIds = [...new Set(eventIds)];
    const events = await Promise.all(
      uniqueIds.map(async (eventId) => {
        try {
          const [event, rsvp, registration] = await Promise.all([
            this._events.getEventById(eventId as EventId),
            this._events.getMyRsvp(eventId),
            firstValueFrom(
              this._registrations.observeMyRegistration(eventId).pipe(take(1)),
            ),
          ]);
          return event &&
            (rsvp?.rsvp === "going" || registration?.status === "registered")
            ? event
            : null;
        } catch (error) {
          console.warn("Skipping an unavailable attended event", {
            eventId,
            error,
          });
          return null;
        }
      }),
    );
    return events.filter((event): event is PkEvent => event !== null);
  }

  private _screenshotAttendedEvents() {
    const events = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_ATTENDED_EVENTS__;
    return events
      ? of(events.map(({ id, ...event }) => new PkEvent(id as EventId, event)))
      : null;
  }
}
