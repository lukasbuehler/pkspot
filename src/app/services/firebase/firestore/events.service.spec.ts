import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { Timestamp } from "@angular/fire/firestore";
import { BehaviorSubject, Observable } from "rxjs";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EventId, EventSchema } from "../../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../analytics.service";
import { AssetUrlService } from "../../asset-url.service";
import { ConsentService } from "../../consent.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { EventsService } from "./events.service";

const deleteFieldMarker = { __type__: "delete" } as const;

const buildEventDoc = (
  id: string,
  start: string,
  end: string,
  extra: Partial<EventSchema> = {},
) => ({
  id,
  name: id,
  slug: `${id}-slug`,
  venue_string: "Test Venue",
  locality_string: "Zurich, Switzerland",
  start: Timestamp.fromDate(new Date(start)),
  end: Timestamp.fromDate(new Date(end)),
  bounds: { north: 47.4, south: 47.3, east: 8.6, west: 8.5 },
  ...extra,
});

describe("EventsService", () => {
  let service: EventsService;
  let firestoreAdapter: {
    getDocument: Mock;
    getCollection: Mock;
    setDocument: Mock;
    updateDocument: Mock;
    deleteDocument: Mock;
    addDocument: Mock;
    documentSnapshots: Mock;
    deleteFieldValue: Mock;
  };
  let consentService: {
    hasConsent: Mock;
    executeWithConsent: Mock;
    executeWhenConsent: Mock;
    consentGranted$: Observable<boolean>;
    isSSR: Mock;
    isBrowser: Mock;
  };

  beforeEach(() => {
    firestoreAdapter = {
      getDocument: vi.fn(),
      getCollection: vi.fn(),
      setDocument: vi.fn(),
      updateDocument: vi.fn(),
      deleteDocument: vi.fn(),
      addDocument: vi.fn(),
      documentSnapshots: vi.fn(),
      deleteFieldValue: vi.fn(() => deleteFieldMarker),
    };
    consentService = {
      hasConsent: vi.fn(() => true),
      executeWithConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
      executeWhenConsent: vi.fn((fn: () => unknown) => Promise.resolve(fn())),
      consentGranted$: new BehaviorSubject(true).asObservable(),
      isSSR: vi.fn(() => false),
      isBrowser: vi.fn(() => true),
    };

    TestBed.configureTestingModule({
      providers: [
        EventsService,
        { provide: FirestoreAdapterService, useValue: firestoreAdapter },
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "admin-user", data: { isAdmin: true } },
            isAdmin: signal(true),
          },
        },
        {
          provide: AssetUrlService,
          useValue: {
            resolveEventAssetUrls: vi.fn((event: EventSchema) => event),
          },
        },
        { provide: ConsentService, useValue: consentService },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });

    service = TestBed.inject(EventsService);
  });

  it("resolves a public slug through event_slugs before loading the event", async () => {
    const doc = buildEventDoc(
      "event-123",
      "2026-06-01T10:00:00.000Z",
      "2026-06-02T10:00:00.000Z",
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "event_slugs/swissjam26") {
        return Promise.resolve({ id: "swissjam26", event_id: "event-123" });
      }
      if (path === "events/event-123") {
        return Promise.resolve(doc);
      }
      return Promise.resolve(null);
    });

    const event = await service.getEventBySlugOrId("swissjam26");

    expect(event?.id).toBe("event-123");
    expect(firestoreAdapter.getDocument).toHaveBeenNthCalledWith(
      1,
      "event_slugs/swissjam26",
    );
    expect(firestoreAdapter.getDocument).toHaveBeenNthCalledWith(
      2,
      "events/event-123",
    );
  });

  it("falls back to a direct event id when no slug alias exists", async () => {
    const doc = buildEventDoc(
      "raw-event-id",
      "2026-06-01T10:00:00.000Z",
      "2026-06-02T10:00:00.000Z",
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "event_slugs/raw-event-id") return Promise.resolve(null);
      if (path === "events/raw-event-id") return Promise.resolve(doc);
      return Promise.resolve(null);
    });

    const event = await service.getEventBySlugOrId("raw-event-id");

    expect(event?.id).toBe("raw-event-id");
    expect(event?.name).toBe("raw-event-id");
  });

  it("does not expose unpublished events by id or listing", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user.data.isAdmin = false;
    authService.isAdmin.set(false);

    firestoreAdapter.getDocument.mockResolvedValue(
      buildEventDoc(
        "draft-event",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { published: false },
      ),
    );
    firestoreAdapter.getCollection.mockResolvedValue([
      buildEventDoc(
        "published-event",
        "2026-07-01T10:00:00.000Z",
        "2026-07-02T10:00:00.000Z",
      ),
      buildEventDoc(
        "draft-event",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { published: false },
      ),
    ]);

    await expect(service.getEventById("draft-event" as EventId)).resolves.toBeNull();

    const events = await service.getEvents();

    expect(events.map((event) => event.id)).toEqual(["published-event"]);
  });

  it("exposes unpublished events to admins", async () => {
    firestoreAdapter.getDocument.mockResolvedValue(
      buildEventDoc(
        "draft-event",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { published: false },
      ),
    );
    firestoreAdapter.getCollection.mockResolvedValue([
      buildEventDoc(
        "draft-event",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { published: false },
      ),
    ]);

    await expect(service.getEventById("draft-event" as EventId)).resolves
      .toMatchObject({ id: "draft-event" });

    const events = await service.getEvents();

    expect(events.map((event) => event.id)).toEqual(["draft-event"]);
  });

  it("observes unpublished events for admins", async () => {
    firestoreAdapter.documentSnapshots.mockReturnValue(
      new BehaviorSubject(
        buildEventDoc(
          "draft-event",
          "2026-06-01T10:00:00.000Z",
          "2026-06-02T10:00:00.000Z",
          { published: false },
        ),
      ).asObservable(),
    );

    const values: Array<string | null> = [];
    const subscription = service
      .observeEventById("draft-event" as EventId)
      .subscribe((event) => values.push(event?.id ?? null));

    expect(values).toEqual(["draft-event"]);
    subscription.unsubscribe();
  });

  it("hides unpublished event snapshots from non-admins", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user.data.isAdmin = false;
    authService.isAdmin.set(false);
    firestoreAdapter.documentSnapshots.mockReturnValue(
      new BehaviorSubject(
        buildEventDoc(
          "draft-event",
          "2026-06-01T10:00:00.000Z",
          "2026-06-02T10:00:00.000Z",
          { published: false },
        ),
      ).asObservable(),
    );

    const values: Array<string | null> = [];
    const subscription = service
      .observeEventById("draft-event" as EventId)
      .subscribe((event) => values.push(event?.id ?? null));

    expect(values).toEqual([null]);
    subscription.unsubscribe();
  });

  it("sorts upcoming/live events before past events when asked for next events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    firestoreAdapter.getCollection.mockResolvedValue([
      buildEventDoc(
        "past",
        "2026-05-01T10:00:00.000Z",
        "2026-05-02T10:00:00.000Z",
      ),
      buildEventDoc(
        "future-later",
        "2026-06-10T10:00:00.000Z",
        "2026-06-11T10:00:00.000Z",
      ),
      buildEventDoc(
        "live",
        "2026-05-20T10:00:00.000Z",
        "2026-05-22T10:00:00.000Z",
      ),
      buildEventDoc(
        "future-sooner",
        "2026-05-25T10:00:00.000Z",
        "2026-05-26T10:00:00.000Z",
      ),
    ]);

    const events = await service.getEvents({ sortByNext: true });

    expect(events.map((event) => event.id)).toEqual([
      "live",
      "future-sooner",
      "future-later",
      "past",
    ]);
    vi.useRealTimers();
  });

  it("creates my RSVP with SDK timestamps and merge semantics", async () => {
    firestoreAdapter.getDocument.mockResolvedValue(null);

    await service.setMyRsvp("event-1", "going");

    expect(firestoreAdapter.getDocument).toHaveBeenCalledWith(
      "events/event-1/rsvps/admin-user",
    );
    expect(firestoreAdapter.setDocument).toHaveBeenCalledWith(
      "events/event-1/rsvps/admin-user",
      expect.objectContaining({
        user_id: "admin-user",
        event_id: "event-1",
        rsvp: "going",
        time_created: expect.any(Date),
        time_updated: expect.any(Date),
      }),
      { merge: true },
    );
  });

  it("updates my RSVP without re-writing adapter Timestamp-like time_created values", async () => {
    const adapterTimestamp = {
      _seconds: 1_775_000_000,
      _nanoseconds: 123_000_000,
    };
    firestoreAdapter.getDocument.mockResolvedValue({
      id: "admin-user",
      user_id: "admin-user",
      event_id: "event-1",
      rsvp: "going",
      time_created: adapterTimestamp,
      time_updated: adapterTimestamp,
    });

    await service.setMyRsvp("event-1", "interested");

    const [, payload, options] = firestoreAdapter.setDocument.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        user_id: "admin-user",
        event_id: "event-1",
        rsvp: "interested",
        time_updated: expect.any(Date),
      }),
    );
    expect(payload).not.toHaveProperty("time_created");
    expect(options).toEqual({ merge: true });
  });

  it("clears my RSVP through the adapter", async () => {
    await service.clearMyRsvp("event-1");

    expect(firestoreAdapter.deleteDocument).toHaveBeenCalledWith(
      "events/event-1/rsvps/admin-user",
    );
  });

  it("updates event area polygons without accepting client-written bounds", async () => {
    await service.updateEvent("event-1" as EventId, {
      name: "Updated Event",
      location_raw: { lat: 47.4, lng: 8.5 },
      area_polygon: [
        {
          area_name: "Main area",
          points: [
            { lat: 47.45, lng: 8.5 },
            { lat: 47.45, lng: 8.6 },
            { lat: 47.35, lng: 8.6 },
          ],
        },
      ],
      custom_markers: [
        {
          name: "Info",
          location: { lat: 47.4, lng: 8.5 },
          priority: undefined,
        },
      ],
    });

    expect(firestoreAdapter.updateDocument).toHaveBeenCalledWith(
      "events/event-1",
      expect.objectContaining({
        name: "Updated Event",
        location_raw: { lat: 47.4, lng: 8.5 },
        area_polygon: [
          {
            area_name: "Main area",
            points: [
              { lat: 47.45, lng: 8.5 },
              { lat: 47.45, lng: 8.6 },
              { lat: 47.35, lng: 8.6 },
            ],
          },
        ],
        custom_markers: [
          {
            name: "Info",
            location: { lat: 47.4, lng: 8.5 },
          },
        ],
      }),
    );
    expect(firestoreAdapter.updateDocument.mock.calls[0][1]).not.toHaveProperty(
      "bounds",
    );
    expect(firestoreAdapter.updateDocument.mock.calls[0][1]).not.toHaveProperty(
      "location",
    );
  });

  it("does not write server-derived plain event descriptions", async () => {
    await service.updateEvent("event-1" as EventId, {
      description: "English fallback",
      description_i18n: {
        en: { text: "English fallback", provider: "user" },
        de: { text: "Deutsche Fassung", provider: "user" },
      },
    });

    expect(firestoreAdapter.updateDocument).toHaveBeenCalledWith(
      "events/event-1",
      expect.objectContaining({
        description_i18n: {
          en: { text: "English fallback", provider: "user" },
          de: { text: "Deutsche Fassung", provider: "user" },
        },
      }),
    );
    expect(firestoreAdapter.updateDocument.mock.calls[0][1]).not.toHaveProperty(
      "description",
    );
  });

  it("deletes localized event descriptions without touching derived descriptions", async () => {
    await service.updateEvent("event-1" as EventId, {
      description_i18n: null,
    });

    const [, payload] = firestoreAdapter.updateDocument.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.description_i18n).toEqual(deleteFieldMarker);
    expect(payload).not.toHaveProperty("description");
    expect(firestoreAdapter.deleteFieldValue).toHaveBeenCalledOnce();
  });

  it("updates links and ticket options while clearing localized descriptions", async () => {
    await service.updateEvent("event-1" as EventId, {
      description_i18n: null,
      event_links: [
        {
          label: "Schedule",
          url: "https://example.com/schedule",
          kind: "schedule",
          primary: true,
        },
      ],
      ticket_options: [
        {
          id: "early",
          label: "Early bird",
          url: "https://example.com/tickets",
          price: { amount: 35, currency: "CHF" },
          availability: "available",
          sale_ends_at: Timestamp.fromDate(new Date("2026-06-01T00:00:00Z")),
          badge: "early_bird",
        },
      ],
    });

    const [, payload] = firestoreAdapter.updateDocument.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.description_i18n).toEqual(deleteFieldMarker);
    expect(payload).not.toHaveProperty("description");
    expect(payload.event_links).toEqual([
      {
        label: "Schedule",
        url: "https://example.com/schedule",
        kind: "schedule",
        primary: true,
      },
    ]);
    expect(payload.ticket_options).toEqual([
      {
        id: "early",
        label: "Early bird",
        url: "https://example.com/tickets",
        price: { amount: 35, currency: "CHF" },
        availability: "available",
        sale_ends_at: expect.any(Timestamp),
        badge: "early_bird",
      },
    ]);
  });

  it("clears external source metadata when requested", async () => {
    await service.updateEvent("event-1" as EventId, {
      external_source: null,
    });

    const [, payload] = firestoreAdapter.updateDocument.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(payload.external_source).toEqual(deleteFieldMarker);
    expect(firestoreAdapter.deleteFieldValue).toHaveBeenCalledOnce();
  });

  it("does not write an RSVP while signed out", async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        EventsService,
        { provide: FirestoreAdapterService, useValue: firestoreAdapter },
        {
          provide: AuthenticationService,
          useValue: { user: { uid: "", data: null } },
        },
        {
          provide: AssetUrlService,
          useValue: {
            resolveEventAssetUrls: vi.fn((event: EventSchema) => event),
          },
        },
        { provide: ConsentService, useValue: consentService },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
      ],
    });
    const signedOutService = TestBed.inject(EventsService);

    await expect(
      signedOutService.setMyRsvp("event-1", "going"),
    ).rejects.toThrow(/requires a signed-in user/);
    await signedOutService.clearMyRsvp("event-1");

    expect(firestoreAdapter.setDocument).not.toHaveBeenCalled();
    expect(firestoreAdapter.deleteDocument).not.toHaveBeenCalled();
  });
});
