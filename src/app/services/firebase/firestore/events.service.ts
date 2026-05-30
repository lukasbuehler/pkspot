import { Injectable, LOCALE_ID, inject } from "@angular/core";
import { deleteField, Timestamp } from "@angular/fire/firestore";
import { Observable, from, map, of, switchMap } from "rxjs";
import { Event } from "../../../../db/models/Event";
import {
  EventId,
  EventSchema,
  EventSlugSchema,
} from "../../../../db/schemas/EventSchema";
import {
  EventRSVPOption,
  EventRSVPSchema,
} from "../../../../db/schemas/EventRSVPSchema";
import { AuthenticationService } from "../authentication.service";
import { ConsentAwareService } from "../../consent-aware.service";
import { AssetUrlService } from "../../asset-url.service";
import {
  FirestoreAdapterService,
  QueryFilter,
} from "../firestore-adapter.service";

type EventDocument = EventSchema & { id: string };
type EventSlugDocument = EventSlugSchema & { id: string };
type EventRSVPDocument = EventRSVPSchema & { id: string };
export type EventWritePatch = Omit<
  Partial<EventSchema>,
  "bounds" | "area_polygon" | "location"
> & {
  area_polygon?: EventSchema["area_polygon"] | null;
};

/**
 * Recursively strip `undefined` values from a plain object so the
 * Firestore SDK doesn't reject the write. We don't replace them with
 * `deleteField()` because the form layer already excludes empty fields
 * before patching.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefined(entry)) as T;
  }
  if (!isPlainObject(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined) continue;
    if (isPlainObject(raw)) {
      const cleaned = stripUndefined(raw);
      // Drop completely empty nested objects to avoid creating `{}` in
      // Firestore where the caller meant "leave this alone".
      if (Object.keys(cleaned).length > 0) out[key] = cleaned;
      continue;
    }
    out[key] = stripUndefined(raw);
  }
  return out as T;
}

function stripServerDerivedEventFields<T extends { description?: unknown }>(
  value: T,
): Omit<T, "description"> {
  const { description: _description, ...rest } = value;
  return rest;
}

@Injectable({
  providedIn: "root",
})
export class EventsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _authService = inject(AuthenticationService);
  private _assetUrls = inject(AssetUrlService);
  private _locale = inject(LOCALE_ID);

  constructor() {
    super();
  }

  // ---------------------------------------------------------------------
  // Admin writes
  //
  // Firestore rules (firestore.rules) require `isAdmin()` for any write
  // to /events/* and /event_slugs/*. The client-side check below is just
  // a fail-fast guard for a friendlier error — the rules are the real
  // enforcement.
  // ---------------------------------------------------------------------

  private _requireAdmin(action: string): void {
    if (!this._isAdmin()) {
      throw new Error(
        `EventsService.${action}: requires admin privileges on the current user.`
      );
    }
  }

  private _isAdmin(): boolean {
    return (
      this._authService.isAdmin?.() === true ||
      this._authService.user.data?.isAdmin === true
    );
  }

  /**
   * Create a new event. If `id` is supplied (e.g., a chosen slug) it's
   * used as the doc id, otherwise Firestore generates one. The slug
   * alias under /event_slugs is written automatically when `slug` is
   * present on the data. Returns the loaded `Event`.
   */
  async createEvent(
    data: EventWritePatch,
    id?: string
  ): Promise<Event> {
    this._requireAdmin("createEvent");

    const now = Timestamp.now();
    const clientData = stripServerDerivedEventFields(data);
    const docData = stripUndefined({
      ...clientData,
      published: data.published ?? true,
      time_created: now,
      time_updated: now,
      created_by: clientData.created_by ?? {
        uid: this._authService.user.uid ?? "",
        username: this._authService.user.data?.displayName,
      },
    }) as EventSchema;

    const eventId =
      id ??
      (await this._firestoreAdapter.addDocument<EventSchema>(
        "events",
        docData
      ));
    if (id) {
      await this._firestoreAdapter.setDocument(`events/${id}`, docData);
    }

    if (data.slug) {
      await this._writeSlugAlias(data.slug, eventId);
    }

    const written = await this.getEventById(eventId as EventId);
    if (!written) {
      throw new Error(
        `EventsService.createEvent: wrote events/${eventId} but failed to read it back.`
      );
    }
    return written;
  }

  /**
   * Patch an existing event with the given fields. Pass only what
   * changed — undefined values are stripped, so `{ name: "X" }` updates
   * only `name`. If `patch.slug` differs from the current slug a new
   * alias is written (the old one is left in place as a redirect-style
   * fallback; clean up manually in the console if you want it gone).
   */
  async updateEvent(
    eventId: EventId,
    patch: EventWritePatch
  ): Promise<void> {
    this._requireAdmin("updateEvent");

    const clientPatch = stripServerDerivedEventFields(patch);
    const cleaned = stripUndefined({
      ...clientPatch,
      area_polygon:
        clientPatch.area_polygon === null ? deleteField() : clientPatch.area_polygon,
      time_updated: Timestamp.now(),
    }) as Partial<EventSchema>;

    await this._firestoreAdapter.updateDocument(
      `events/${eventId}`,
      cleaned as Record<string, unknown>
    );

    if (typeof patch.slug === "string" && patch.slug.length > 0) {
      await this._writeSlugAlias(patch.slug, eventId);
    }
  }

  /**
   * Delete an event document. Does NOT scrub /event_slugs entries
   * referencing this event — admins clean those up in the console if
   * needed (rare; deleting an event is itself rare).
   */
  async deleteEvent(eventId: EventId): Promise<void> {
    this._requireAdmin("deleteEvent");
    await this._firestoreAdapter.deleteDocument(`events/${eventId}`);
  }

  async getMyRsvp(eventId: EventId | string): Promise<EventRSVPSchema | null> {
    const uid = this._authService.user.uid;
    if (!uid) return null;
    return this._firestoreAdapter.getDocument<EventRSVPDocument>(
      `events/${eventId}/rsvps/${uid}`,
    );
  }

  async setMyRsvp(
    eventId: EventId | string,
    rsvp: EventRSVPOption,
  ): Promise<void> {
    const uid = this._authService.user.uid;
    if (!uid) {
      throw new Error("EventsService.setMyRsvp: requires a signed-in user.");
    }

    const now = new Date();
    const existing = await this.getMyRsvp(eventId);
    const data: EventRSVPSchema = {
      user_id: uid,
      event_id: String(eventId),
      rsvp,
      time_updated: now,
    };
    if (!existing) {
      data.time_created = now;
    }

    await this._firestoreAdapter.setDocument(
      `events/${eventId}/rsvps/${uid}`,
      data as unknown as Record<string, unknown>,
      { merge: true },
    );
  }

  async clearMyRsvp(eventId: EventId | string): Promise<void> {
    const uid = this._authService.user.uid;
    if (!uid) return;
    await this._firestoreAdapter.deleteDocument(`events/${eventId}/rsvps/${uid}`);
  }

  private async _writeSlugAlias(slug: string, eventId: string): Promise<void> {
    const normalized = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(normalized)) {
      throw new Error(
        `EventsService: invalid slug "${slug}" — must match [a-z0-9-]+.`
      );
    }
    const slugDoc: EventSlugSchema = { event_id: eventId };
    await this._firestoreAdapter.setDocument(
      `event_slugs/${normalized}`,
      slugDoc as unknown as Record<string, unknown>
    );
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
    if (doc.published === false && !this._isAdmin()) return null;
    return new Event(
      eventId,
      this._assetUrls.resolveEventAssetUrls(doc),
      this._locale,
    );
  }

  observeEventBySlugOrId(slugOrId: string): Observable<Event | null> {
    return from(this._resolveEventId(slugOrId)).pipe(
      switchMap((id) => {
        if (!id) return of(null);
        return this.observeEventById(id as EventId);
      }),
    );
  }

  observeEventById(eventId: EventId): Observable<Event | null> {
    return this._firestoreAdapter
      .documentSnapshots<EventDocument>(`events/${eventId}`)
      .pipe(
        map((doc) => {
          if (!doc || (doc.published === false && !this._isAdmin())) return null;
          return new Event(
            eventId,
            this._assetUrls.resolveEventAssetUrls(doc),
            this._locale,
          );
        }),
      );
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
      .filter(
        (d) =>
          options.includeUnpublished ||
          this._isAdmin() ||
          d.published !== false,
      )
      .map(
        (d) =>
          new Event(
            d.id as EventId,
            this._assetUrls.resolveEventAssetUrls(d),
            this._locale,
          ),
      );

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
