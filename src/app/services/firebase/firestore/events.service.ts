import { Injectable, LOCALE_ID, inject } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import {
  Observable,
  catchError,
  filter,
  from,
  map,
  of,
  switchMap,
  throwError,
} from "rxjs";
import { Event } from "../../../../db/models/Event";
import {
  EVENT_DISCOVERY_COLLECTION,
  EventDiscoverySchema,
  isEventPubliclyDiscoverable,
} from "../../../../db/schemas/EventDiscoverySchema";
import {
  EventAccessRole,
  EventAccessSchema,
  EventId,
  EventOwnerSchema,
  EventSchema,
  EventSlugSchema,
} from "../../../../db/schemas/EventSchema";
import { normalizeEventModel } from "../../../../db/schemas/EventNormalization";
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
type EventDiscoveryDocument = EventDiscoverySchema & { id: string };
type EventSlugDocument = EventSlugSchema & { id: string };
type EventRSVPDocument = EventRSVPSchema & { id: string };
interface ScreenshotGlobal {
  __PKSPOT_SCREENSHOT_EVENT_INDEX__?: { events?: EventDocument[] };
}
export type EventAccessDocument = EventAccessSchema & { id: string };
export type EventWritePatch = Omit<
  Partial<EventSchema>,
  | "bounds"
  | "area_polygon"
  | "location"
  | "description_i18n"
  | "external_source"
  | "organizer"
  | "organizer_name"
  | "location_raw"
  | "venue_string"
  | "locality_string"
  | "created_by"
> & {
  area_polygon?: EventSchema["area_polygon"] | null;
  description_i18n?: EventSchema["description_i18n"] | null;
  external_source?: EventSchema["external_source"] | null;
  organizer?: EventSchema["organizer"] | null;
  organizer_name?: string | null;
  location_raw?: EventSchema["location_raw"] | null;
  venue_string?: string | null;
  locality_string?: string | null;
};
export type EventCreateData = EventWritePatch & { owner: EventOwnerSchema };

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
  const rest = { ...value };
  delete rest.description;
  return rest;
}

@Injectable({
  providedIn: "root",
})
export class EventsService extends ConsentAwareService {
  private _firestoreAdapter = inject(FirestoreAdapterService);
  private _authService = inject(AuthenticationService);
  private _authorizationStateResolved$ =
    this._authService.authorizationStateResolved$;
  private _assetUrls = inject(AssetUrlService);
  private _locale = inject(LOCALE_ID);

  constructor() {
    super();
  }

  // ---------------------------------------------------------------------
  // Ownership and access
  //
  // These checks provide friendly client errors. Firestore rules independently
  // enforce the same owner / organization-manager / collaborator policy.
  // ---------------------------------------------------------------------

  private _isAdmin(): boolean {
    return (
      this._authService.isAdmin?.() === true ||
      this._authService.user.data?.isAdmin === true
    );
  }

  private async _canAssignOwner(owner: EventOwnerSchema): Promise<boolean> {
    if (this._isAdmin()) return true;
    const uid = this._authService.user.uid;
    if (!uid) return false;
    if (owner.type === "user") return owner.user_id === uid;
    const membership =
      await this._firestoreAdapter.getDocument<{
        role?: unknown;
      }>(`organizations/${owner.organization_id}/members/${uid}`);
    return membership?.role === "owner" || membership?.role === "admin";
  }

  async getMyEventAccess(
    eventId: EventId | string,
  ): Promise<EventAccessSchema | null> {
    const uid = this._authService.user.uid;
    if (!uid) return null;
    return this._firestoreAdapter.getDocument<EventAccessDocument>(
      `events/${eventId}/access/${uid}`,
    );
  }

  async canEditEvent(event: Event): Promise<boolean> {
    if (this._isAdmin()) return true;
    const uid = this._authService.user.uid;
    if (!uid) return false;
    if (
      event.organizer?.type === "organization" &&
      event.organizerAccess === "edit"
    ) {
      const organizerMembership =
        await this._firestoreAdapter.getDocument<{ role?: unknown }>(
          `organizations/${event.organizer.organization.id}/members/${uid}`,
        );
      if (
        organizerMembership?.role === "owner" ||
        organizerMembership?.role === "admin"
      ) {
        return true;
      }
    }
    if (!event.owner) return false;
    if (event.owner.type === "user") {
      if (event.owner.user_id === uid) return true;
      return (await this.getMyEventAccess(event.id))?.role === "collaborator";
    }
    const [membership, access] = await Promise.all([
      this._firestoreAdapter.getDocument<{ role?: unknown }>(
        `organizations/${event.owner.organization_id}/members/${uid}`,
      ),
      this.getMyEventAccess(event.id),
    ]);
    return (
      membership?.role === "owner" ||
      membership?.role === "admin" ||
      access?.role === "collaborator"
    );
  }

  async canManageEvent(event: Event): Promise<boolean> {
    if (this._isAdmin()) return true;
    const uid = this._authService.user.uid;
    if (!uid || !event.owner) return false;
    if (event.owner.type === "user") return event.owner.user_id === uid;
    const membership = await this._firestoreAdapter.getDocument<{
      role?: unknown;
    }>(`organizations/${event.owner.organization_id}/members/${uid}`);
    return membership?.role === "owner" || membership?.role === "admin";
  }

  async canViewEvent(event: Event): Promise<boolean> {
    if (event.published && event.visibility !== "private") return true;
    if (await this.canEditEvent(event)) return true;
    const uid = this._authService.user.uid;
    if (!uid) return false;
    if (event.organizer?.type === "organization") {
      const organizerMembership =
        await this._firestoreAdapter.getDocument<{ role?: unknown }>(
          `organizations/${event.organizer.organization.id}/members/${uid}`,
        );
      if (
        organizerMembership?.role === "owner" ||
        organizerMembership?.role === "admin"
      ) {
        return true;
      }
    }
    if (!event.published) return false;
    const access = await this.getMyEventAccess(event.id);
    if (access?.role === "viewer" || access?.role === "collaborator") {
      return true;
    }
    if (
      event.viewerPolicy?.audience !== "organization_members" ||
      !event.viewerPolicy.organization_id
    ) {
      return false;
    }
    const membership = await this._firestoreAdapter.getDocument<{
      role?: unknown;
    }>(
      `organizations/${event.viewerPolicy.organization_id}/members/${uid}`,
    );
    return (
      membership?.role === "owner" ||
      membership?.role === "admin" ||
      membership?.role === "reviewer" ||
      membership?.role === "member"
    );
  }

  async listEventAccess(event: Event): Promise<EventAccessDocument[]> {
    if (!(await this.canManageEvent(event))) {
      throw new Error(
        "EventsService.listEventAccess: requires event management privileges.",
      );
    }
    return this._firestoreAdapter.getCollection<EventAccessDocument>(
      `events/${event.id}/access`,
    );
  }

  async setEventAccess(
    event: Event,
    userId: string,
    role: EventAccessRole,
  ): Promise<void> {
    if (!(await this.canManageEvent(event))) {
      throw new Error(
        "EventsService.setEventAccess: requires event management privileges.",
      );
    }
    const grantedBy = this._authService.user.uid;
    if (!grantedBy) {
      throw new Error("EventsService.setEventAccess: requires a signed-in user.");
    }
    const path = `events/${event.id}/access/${userId}`;
    const existing =
      await this._firestoreAdapter.getDocument<EventAccessSchema>(path);
    const now = Timestamp.now();
    await this._firestoreAdapter.setDocument(path, {
      user_id: userId,
      role,
      granted_by: existing?.granted_by ?? grantedBy,
      time_created: existing?.time_created ?? now,
      time_updated: now,
    } satisfies EventAccessSchema);
  }

  async removeEventAccess(event: Event, userId: string): Promise<void> {
    if (!(await this.canManageEvent(event))) {
      throw new Error(
        "EventsService.removeEventAccess: requires event management privileges.",
      );
    }
    await this._firestoreAdapter.deleteDocument(
      `events/${event.id}/access/${userId}`,
    );
  }

  /**
   * Create a new event. If `id` is supplied (e.g., a chosen slug) it's
   * used as the doc id, otherwise Firestore generates one. The slug
   * alias under /event_slugs is written automatically when `slug` is
   * present on the data. Returns the loaded `Event`.
   */
  async createEvent(
    data: EventCreateData,
    id?: string
  ): Promise<Event> {
    if (!(await this._canAssignOwner(data.owner))) {
      throw new Error(
        "EventsService.createEvent: the current user cannot assign this owner.",
      );
    }

    const now = Timestamp.now();
    const clientData = stripServerDerivedEventFields(data);
    const candidate = stripUndefined({
      ...clientData,
      description_i18n:
        clientData.description_i18n === null
          ? undefined
          : clientData.description_i18n,
      external_source:
        clientData.external_source === null
          ? undefined
          : clientData.external_source,
      organizer:
        clientData.organizer === null ? undefined : clientData.organizer,
      organizer_name:
        clientData.organizer_name === null
          ? undefined
          : clientData.organizer_name,
      venue_string:
        clientData.venue_string === null ? undefined : clientData.venue_string,
      locality_string:
        clientData.locality_string === null
          ? undefined
          : clientData.locality_string,
      location_raw:
        clientData.location_raw === null ? undefined : clientData.location_raw,
      time_created: now,
      time_updated: now,
      created_by: {
        uid: this._authService.user.uid ?? "",
        username: this._authService.user.data?.displayName,
      },
    }) as EventSchema;
    const normalized = normalizeEventModel(candidate, { requireOwner: true });
    if (normalized.invalid.length > 0) {
      throw new Error(
        `EventsService.createEvent: invalid normalized fields: ${normalized.invalid.join(", ")}.`
      );
    }
    const docData = stripUndefined({
      ...candidate,
      ...normalized.patch,
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
    const clientPatch = stripServerDerivedEventFields(patch);
    const current = await this._firestoreAdapter.getDocument<EventDocument>(
      `events/${eventId}`
    );
    if (!current) {
      throw new Error(`EventsService.updateEvent: events/${eventId} not found.`);
    }
    const currentEvent = this._toEvent(eventId, current);
    if (!(await this.canEditEvent(currentEvent))) {
      throw new Error(
        "EventsService.updateEvent: requires event editing privileges.",
      );
    }
    if (
      !this._isAdmin() &&
      clientPatch.owner !== undefined &&
      JSON.stringify(clientPatch.owner) !== JSON.stringify(current.owner)
    ) {
      throw new Error(
        "EventsService.updateEvent: only admins can transfer event ownership.",
      );
    }
    const publicationPatch =
      clientPatch.publication_state !== undefined
        ? { published: clientPatch.publication_state === "published" }
        : clientPatch.published !== undefined
          ? {
              publication_state: clientPatch.published
                ? ("published" as const)
                : ("draft" as const),
            }
          : {};
    const normalized = normalizeEventModel({
      publication_state:
        publicationPatch.publication_state ??
        clientPatch.publication_state ??
        current.publication_state,
      published:
        publicationPatch.published ?? clientPatch.published ?? current.published,
      visibility: clientPatch.visibility ?? current.visibility,
      discoverability:
        clientPatch.discoverability ?? current.discoverability,
      viewer_policy: clientPatch.viewer_policy ?? current.viewer_policy,
      kind: clientPatch.kind ?? current.kind,
      schedule_mode: clientPatch.schedule_mode ?? current.schedule_mode,
      lifecycle_status:
        clientPatch.lifecycle_status ?? current.lifecycle_status,
      priority: clientPatch.priority ?? current.priority,
      notification_policy:
        clientPatch.notification_policy ?? current.notification_policy,
      attendance: clientPatch.attendance ?? current.attendance,
      timing: clientPatch.timing ?? current.timing,
      active_until: clientPatch.active_until ?? current.active_until,
      time_zone: clientPatch.time_zone ?? current.time_zone,
      organizer: clientPatch.organizer ?? current.organizer,
      organizer_access:
        clientPatch.organizer_access ?? current.organizer_access,
      owner: clientPatch.owner ?? current.owner,
      event_categories:
        clientPatch.event_categories ?? current.event_categories,
    });
    if (normalized.invalid.length > 0) {
      throw new Error(
        `EventsService.updateEvent: invalid normalized fields: ${normalized.invalid.join(", ")}.`
      );
    }
    const shouldDeleteDescription = clientPatch.description_i18n === null;
    const shouldDeleteExternalSource = clientPatch.external_source === null;
    const shouldDeleteOrganizer = clientPatch.organizer === null;
    const shouldDeleteOrganizerName = clientPatch.organizer_name === null;
    const shouldDeleteLocationRaw = clientPatch.location_raw === null;
    const shouldDeleteVenue = clientPatch.venue_string === null;
    const shouldDeleteLocality = clientPatch.locality_string === null;
    const cleaned = stripUndefined({
      ...clientPatch,
      ...publicationPatch,
      ...normalized.patch,
      description_i18n: shouldDeleteDescription
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.description_i18n,
      external_source: shouldDeleteExternalSource
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.external_source,
      organizer: shouldDeleteOrganizer
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.organizer,
      organizer_name: shouldDeleteOrganizerName
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.organizer_name,
      location_raw: shouldDeleteLocationRaw
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.location_raw,
      venue_string: shouldDeleteVenue
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.venue_string,
      locality_string: shouldDeleteLocality
        ? this._firestoreAdapter.deleteFieldValue()
        : clientPatch.locality_string,
      area_polygon:
        clientPatch.area_polygon === null
          ? this._firestoreAdapter.deleteFieldValue()
          : clientPatch.area_polygon,
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
    const current = await this.getEventById(eventId);
    if (!current || !(await this.canManageEvent(current))) {
      throw new Error(
        "EventsService.deleteEvent: requires event management privileges.",
      );
    }
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
      time_updated_raw_ms: now.getTime(),
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
    const screenshotEvent = this._screenshotEvents().find(
      (event) => event.id === slugOrId || event.slug === slugOrId,
    );
    if (screenshotEvent) return screenshotEvent;
    if (this.isBrowser()) {
      await this._authService.waitForAuthorizationState();
    }
    const id = await this._resolveEventId(slugOrId);
    if (!id) return null;
    return this.getEventById(id as EventId);
  }

  async getEventById(eventId: EventId): Promise<Event | null> {
    const screenshotEvent = this._screenshotEvents().find(
      (event) => event.id === eventId,
    );
    if (screenshotEvent) return screenshotEvent;
    if (this.isBrowser()) {
      await this._authService.waitForAuthorizationState();
    }
    let doc: EventDocument | null;
    try {
      doc = await this._firestoreAdapter.getDocument<EventDocument>(
        `events/${eventId}`,
      );
    } catch (error) {
      if (this._isPermissionDenied(error)) return null;
      throw error;
    }
    if (!doc) return null;
    const event = new Event(
      eventId,
      this._assetUrls.resolveEventAssetUrls(doc),
      this._locale,
    );
    return (await this.canViewEvent(event)) ? event : null;
  }

  observeEventBySlugOrId(slugOrId: string): Observable<Event | null> {
    const screenshotEvent = this._screenshotEvents().find(
      (event) => event.id === slugOrId || event.slug === slugOrId,
    );
    if (screenshotEvent) return of(screenshotEvent);
    const authorizationReady$ = this.isSSR()
      ? of(undefined)
      : from(this._authService.waitForAuthorizationState());
    return authorizationReady$.pipe(
      switchMap(() => this._resolveEventId(slugOrId)),
      switchMap((id) => {
        if (!id) return of(null);
        return this.observeEventById(id as EventId);
      }),
    );
  }

  observeEventById(eventId: EventId): Observable<Event | null> {
    const authorizationReady$ = this.isSSR()
      ? of(true)
      : this._authorizationStateResolved$.pipe(filter(Boolean));
    return authorizationReady$.pipe(
      switchMap(() =>
        this._firestoreAdapter
          .documentSnapshots<EventDocument>(`events/${eventId}`)
          .pipe(
            catchError((error: unknown) =>
              this._isPermissionDenied(error)
                ? of(null)
                : throwError(() => error),
            ),
          ),
      ),
      switchMap((doc) => {
        if (!doc) return of(null);
        const event = this._toEvent(eventId, doc);
        if (
          (event.published && event.visibility !== "private") ||
          this._isAdmin()
        ) {
          return of(event);
        }
        if (!event.published && !event.owner) return of(null);
        return from(this.canViewEvent(event)).pipe(
          map((canView) => (canView ? event : null)),
        );
      }),
    );
  }

  private _toEvent(eventId: EventId, doc: EventDocument): Event {
    return new Event(
      eventId,
      this._assetUrls.resolveEventAssetUrls(doc),
      this._locale,
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
    const screenshotEvents = this._screenshotEvents();
    if (screenshotEvents.length > 0) {
      return options.sortByNext
        ? this._sortEventsByNext(screenshotEvents)
        : screenshotEvents.sort((a, b) => b.start.getTime() - a.start.getTime());
    }
    const useCanonicalSource =
      options.includeUnpublished === true && this._isAdmin();
    const filters: QueryFilter[] = [];
    let docs: (EventDocument | EventDiscoveryDocument)[];
    if (useCanonicalSource) {
      docs = await this._firestoreAdapter.getCollection<EventDocument>(
        "events",
        filters,
      );
    } else {
      try {
        docs =
          await this._firestoreAdapter.getCollection<EventDiscoveryDocument>(
            EVENT_DISCOVERY_COLLECTION,
            filters,
          );
      } catch (error) {
        if (!this.isSSR() || !this._isPermissionDenied(error)) throw error;
        // Staged-deploy compatibility: old rules do not know the projection
        // yet. Once the projection rules are live this path is never used.
        try {
          docs = await this._firestoreAdapter.getCollection<EventDocument>(
            "events",
            filters,
          );
        } catch (fallbackError) {
          if (!this._isPermissionDenied(fallbackError)) throw fallbackError;
          docs = [];
        }
      }
    }

    const visibleDocs = useCanonicalSource
      ? docs
      : docs.filter(isEventPubliclyDiscoverable);
    const events = visibleDocs.map(
      (d) =>
        new Event(
          d.id as EventId,
          this._assetUrls.resolveEventAssetUrls(d),
          this._locale,
        ),
    );

    if (options.sortByNext) {
      return this._sortEventsByNext(events);
    }

    return events.sort((a, b) => b.start.getTime() - a.start.getTime());
  }

  private _screenshotEvents(): Event[] {
    const documents = (globalThis as ScreenshotGlobal)
      .__PKSPOT_SCREENSHOT_EVENT_INDEX__?.events;
    if (!documents) return [];
    return documents.map(
      (document) =>
        new Event(
          document.id as EventId,
          this._assetUrls.resolveEventAssetUrls(document),
          this._locale,
        ),
    );
  }

  /** Load published events organized by one organization. */
  async getEventsForOrganization(organizationId: string): Promise<Event[]> {
    const docs = await this._firestoreAdapter.getCollection<EventDiscoveryDocument>(
      EVENT_DISCOVERY_COLLECTION,
      [
        {
          fieldPath: "organizer.organization.id",
          opStr: "==",
          value: organizationId,
        },
      ],
    );
    const events = docs
      .filter(isEventPubliclyDiscoverable)
      .map(
        (document) =>
          new Event(
            document.id as EventId,
            this._assetUrls.resolveEventAssetUrls(document),
            this._locale,
          ),
      );
    return this._sortEventsByNext(events);
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

  private _sortEventsByNext(events: Event[]): Event[] {
    const now = Date.now();
    return events.sort((left, right) => {
      const leftIsCurrent = left.end.getTime() >= now;
      const rightIsCurrent = right.end.getTime() >= now;
      if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
      return leftIsCurrent
        ? left.start.getTime() - right.start.getTime()
        : right.start.getTime() - left.start.getTime();
    });
  }

  private async _resolveEventId(slugOrId: string): Promise<string | null> {
    if (/^[a-z0-9-]+$/.test(slugOrId)) {
      try {
        const slugDoc =
          await this._firestoreAdapter.getDocument<EventSlugDocument>(
            `event_slugs/${slugOrId}`,
          );
        if (slugDoc?.event_id) {
          return String(slugDoc.event_id);
        }
      } catch (error) {
        // A denied alias can be a private/draft slug or simply a raw event id
        // without an alias. Let the canonical document read make the final
        // authorization decision without exposing alias contents.
        if (!this._isPermissionDenied(error)) throw error;
      }
    }

    // A known id does not need an existence probe. The canonical get applies
    // publication/visibility rules without making ids enumerable.
    return slugOrId;
  }

  private _isPermissionDenied(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const code = String((error as { code?: unknown }).code ?? "");
    return code === "permission-denied" || code === "firestore/permission-denied";
  }

}
