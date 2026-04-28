import { Injectable, inject } from "@angular/core";
import { Event } from "../../../../db/models/Event";
import {
  EventId,
  EventSchema,
  EventSlugSchema,
} from "../../../../db/schemas/EventSchema";
import { ConsentAwareService } from "../../consent-aware.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

type EventDocument = EventSchema & { id: string };
type EventSlugDocument = EventSlugSchema & { id: string };

@Injectable({
  providedIn: "root",
})
export class EventsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);

  constructor() {
    super();
  }

  /** Resolve a public slug or raw ID to a loaded Event, or null if not found. */
  async getEventBySlugOrId(slugOrId: string): Promise<Event | null> {
    const id = await this._resolveEventId(slugOrId);
    if (!id) return null;
    return this.getEventById(id as EventId);
  }

  async getEventById(eventId: EventId): Promise<Event | null> {
    const doc = await this._firestoreAdapter.getDocument<EventDocument>(
      `events/${eventId}`
    );
    if (!doc) return null;
    if (doc.published === false) return null;
    return new Event(eventId, doc as EventSchema);
  }

  /**
   * Load all published events. Sorted by start date descending (newest first)
   * unless `sortByNext` is true — in which case upcoming/live events come
   * first (soonest first), then past events (most-recent first).
   */
  async getEvents(
    options: { sortByNext?: boolean; includeUnpublished?: boolean } = {}
  ): Promise<Event[]> {
    const filters: QueryFilter[] = [];
    const docs = await this._firestoreAdapter.getCollection<EventDocument>(
      "events",
      filters
    );

    const events = docs
      .filter((d) => options.includeUnpublished || d.published !== false)
      .map((d) => new Event(d.id as EventId, d as EventSchema));

    if (options.sortByNext) {
      const now = Date.now();
      return events.sort((a, b) => {
        const aFuture = a.end.getTime() >= now;
        const bFuture = b.end.getTime() >= now;
        if (aFuture && !bFuture) return -1;
        if (!aFuture && bFuture) return 1;
        if (aFuture) return a.start.getTime() - b.start.getTime();
        return b.start.getTime() - a.start.getTime();
      });
    }

    return events.sort((a, b) => b.start.getTime() - a.start.getTime());
  }

  /**
   * Events whose map-island promo is currently active (promo_region set,
   * promo_starts_at reached, end not passed). Used by the bounds-based
   * map-island trigger to find candidates for the visible viewport.
   */
  async getPromotableEvents(now: Date = new Date()): Promise<Event[]> {
    const all = await this.getEvents();
    return all.filter((e) => e.isPromotable(now));
  }

  /**
   * Events to surface on a community landing page. Filters to events whose
   * `community_keys` includes the given key, are not past, and start within
   * `withinMonths` (default 6). Sorted soonest-first.
   */
  async getEventsForCommunity(
    communityKey: string,
    options: { withinMonths?: number; now?: Date } = {}
  ): Promise<Event[]> {
    const now = options.now ?? new Date();
    const withinMonths = options.withinMonths ?? 6;
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() + withinMonths);

    const all = await this.getEvents();
    return all
      .filter(
        (e) =>
          e.communityKeys.includes(communityKey) &&
          !e.isPast(now) &&
          e.start.getTime() <= cutoff.getTime()
      )
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private async _resolveEventId(slugOrId: string): Promise<string | null> {
    if (/^[a-z0-9-]+$/.test(slugOrId)) {
      const slugDoc =
        await this._firestoreAdapter.getDocument<EventSlugDocument>(
          `event_slugs/${slugOrId}`
        );
      if (slugDoc?.event_id) {
        return String(slugDoc.event_id);
      }
    }

    const direct = await this._firestoreAdapter.getDocument<EventDocument>(
      `events/${slugOrId}`
    );
    if (direct) return slugOrId;

    return null;
  }
}
