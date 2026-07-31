import { isPlatformBrowser } from "@angular/common";
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  resource,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { firstValueFrom, of } from "rxjs";
import { catchError, map, switchMap, take } from "rxjs/operators";
import { Event as PkEvent } from "../../db/models/Event";
import type { EventId, EventSchema } from "../../db/schemas/EventSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { EventsService } from "./firebase/firestore/events.service";
import { EventLiveUpdatesService } from "./firebase/firestore/event-live-updates.service";
import { EventRegistrationsService } from "./firebase/firestore/event-registrations.service";
import { MyEventsService } from "./my-events.service";

interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_ATTENDED_EVENTS__?: (EventSchema & { id: string })[];
}

interface MyEventGroups {
  going: PkEvent[];
  saved: PkEvent[];
}

@Injectable({ providedIn: "root" })
export class MyEventContextService {
  private readonly _auth = inject(AuthenticationService);
  private readonly _events = inject(EventsService);
  private readonly _liveUpdates = inject(EventLiveUpdatesService);
  private readonly _registrations = inject(EventRegistrationsService);
  private readonly _myEvents = inject(MyEventsService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly _now = signal(new Date());

  private readonly _legacySubscriptionEventIds = toSignal(
    this._auth.authState$.pipe(
      switchMap((user) =>
        user?.uid && this._isBrowser
          ? this._liveUpdates.observeCurrentUserSubscriptions()
          : of([]),
      ),
      map((subscriptions) =>
        subscriptions.map((subscription) => subscription.eventId),
      ),
      catchError((error) => {
        console.warn("Could not load legacy event subscriptions", error);
        return of([]);
      }),
    ),
    { initialValue: [] as string[] },
  );
  private readonly _candidateEventIds = computed(() => [
    ...new Set([
      ...this._myEvents.candidateEventIds(),
      ...this._legacySubscriptionEventIds(),
    ]),
  ]);
  private readonly _eventRequest = computed(() =>
    this._isBrowser
      ? {
          userId: this._myEvents.userId(),
          eventIds: this._candidateEventIds(),
          localSavedEventIds: this._myEvents.localSavedEventIds(),
        }
      : undefined,
  );
  private readonly _groupsResource = resource({
    params: this._eventRequest,
    loader: ({ params }) =>
      this._resolveEventGroups(
        params.eventIds,
        params.userId,
        new Set(params.localSavedEventIds),
      ),
  });

  readonly now = this._now.asReadonly();
  readonly goingEvents = computed(
    () => this._groupsResource.value()?.going ?? [],
  );
  readonly savedEvents = computed(
    () => this._groupsResource.value()?.saved ?? [],
  );
  readonly attendedEvents = this.goingEvents;
  readonly isLoading = computed(() => this._groupsResource.isLoading());
  readonly liveEvents = computed(() =>
    this.goingEvents()
      .filter((event) => event.isLive(this.now()))
      .sort((left, right) => left.end.getTime() - right.end.getTime()),
  );
  readonly hasLiveEvent = computed(() => this.liveEvents().length > 0);

  constructor() {
    if (!this._isBrowser) return;
    const interval = window.setInterval(() => this._now.set(new Date()), 60_000);
    this._destroyRef.onDestroy(() => window.clearInterval(interval));
  }

  private async _resolveEventGroups(
    eventIds: readonly string[],
    userId: string | null,
    localSavedEventIds: ReadonlySet<string>,
  ): Promise<MyEventGroups> {
    const screenshotEvents = this._screenshotAttendedEvents();
    if (screenshotEvents) {
      return { going: screenshotEvents, saved: [] };
    }

    const groups: MyEventGroups = { going: [], saved: [] };
    const uniqueIds = [...new Set(eventIds)];
    await Promise.all(
      uniqueIds.map(async (eventId) => {
        try {
          const event = await this._events.getEventById(eventId as EventId);
          if (!event) return;
          if (!userId) {
            if (localSavedEventIds.has(eventId)) groups.saved.push(event);
            return;
          }

          const [rsvp, registration] = await Promise.all([
            this._events.getMyRsvp(eventId),
            firstValueFrom(
              this._registrations.observeMyRegistration(eventId).pipe(take(1)),
            ),
          ]);
          if (
            rsvp?.rsvp === "going" ||
            registration?.status === "registered"
          ) {
            groups.going.push(event);
          } else if (
            rsvp?.rsvp === "interested" ||
            localSavedEventIds.has(eventId)
          ) {
            groups.saved.push(event);
          }
        } catch (error) {
          console.warn("Skipping an unavailable personal event", {
            eventId,
            error,
          });
        }
      }),
    );

    groups.going.sort(comparePersonalEvents);
    groups.saved.sort(comparePersonalEvents);
    return groups;
  }

  private _screenshotAttendedEvents(): PkEvent[] | null {
    const events = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_ATTENDED_EVENTS__;
    return events
      ? events.map(({ id, ...event }) => new PkEvent(id as EventId, event))
      : null;
  }
}

function comparePersonalEvents(left: PkEvent, right: PkEvent): number {
  const now = Date.now();
  const leftPast = left.end.getTime() < now;
  const rightPast = right.end.getTime() < now;
  if (leftPast !== rightPast) return leftPast ? 1 : -1;
  return leftPast
    ? right.end.getTime() - left.end.getTime()
    : left.start.getTime() - right.start.getTime();
}
