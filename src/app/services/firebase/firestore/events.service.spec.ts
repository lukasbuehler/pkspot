import { TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject, Observable } from "rxjs";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
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
  created_by: { uid: "admin-user" },
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
      getDocument: vi.fn().mockResolvedValue(
        buildEventDoc(
          "event-1",
          "2026-06-01T10:00:00.000Z",
          "2026-06-02T10:00:00.000Z",
        ),
      ),
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
            authState$: new BehaviorSubject({
              uid: "admin-user",
              data: { isAdmin: true },
            }),
            authorizationStateResolved: signal(true),
            authorizationStateResolved$: new BehaviorSubject(true),
            waitForAuthorizationState: vi.fn().mockResolvedValue(undefined),
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

  afterEach(() => {
    delete (
      globalThis as typeof globalThis & {
        __PKSPOT_SCREENSHOT_EVENT_INDEX__?: unknown;
      }
    ).__PKSPOT_SCREENSHOT_EVENT_INDEX__;
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it("uses screenshot event fixtures without querying Firestore", async () => {
    const event = buildEventDoc(
      "visual-event",
      "2026-08-01T10:00:00.000Z",
      "2026-08-01T18:00:00.000Z",
    );
    (
      globalThis as typeof globalThis & {
        __PKSPOT_SCREENSHOT_EVENT_INDEX__?: { events: unknown[] };
      }
    ).__PKSPOT_SCREENSHOT_EVENT_INDEX__ = { events: [event] };

    const events = await service.getEvents({ sortByNext: true });
    const resolved = await service.getEventBySlugOrId("visual-event-slug");

    expect(events.map(({ id }) => id)).toEqual(["visual-event"]);
    expect(resolved?.id).toBe("visual-event");
    expect(firestoreAdapter.getCollection).not.toHaveBeenCalled();
    expect(firestoreAdapter.getDocument).not.toHaveBeenCalled();
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

  it("waits for authorization before resolving a draft slug", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      waitForAuthorizationState: Mock;
    };
    let resolveAuthorization!: () => void;
    let authorizationResolved = false;
    authService.waitForAuthorizationState.mockImplementation(
      () => {
        if (authorizationResolved) return Promise.resolve();
        return new Promise<void>((resolve) => {
          resolveAuthorization = () => {
            authorizationResolved = true;
            resolve();
          };
        });
      },
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "event_slugs/draft-jam") {
        return Promise.resolve({ id: "draft-jam", event_id: "draft-event" });
      }
      return Promise.resolve(
        buildEventDoc(
          "draft-event",
          "2026-06-01T10:00:00.000Z",
          "2026-06-02T10:00:00.000Z",
          { published: false },
        ),
      );
    });

    const eventPromise = service.getEventBySlugOrId("draft-jam");
    expect(firestoreAdapter.getDocument).not.toHaveBeenCalled();

    resolveAuthorization();
    const event = await eventPromise;

    expect(event?.id).toBe("draft-event");
    expect(firestoreAdapter.getDocument).toHaveBeenNthCalledWith(
      1,
      "event_slugs/draft-jam",
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

  it("falls back to a raw event id when the alias lookup is denied", async () => {
    const permissionDenied = Object.assign(new Error("denied"), {
      code: "permission-denied",
    });
    const doc = buildEventDoc(
      "raw-event-id",
      "2026-06-01T10:00:00.000Z",
      "2026-06-02T10:00:00.000Z",
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "event_slugs/raw-event-id") {
        return Promise.reject(permissionDenied);
      }
      if (path === "events/raw-event-id") return Promise.resolve(doc);
      return Promise.resolve(null);
    });

    await expect(service.getEventBySlugOrId("raw-event-id")).resolves
      .toMatchObject({ id: "raw-event-id" });
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

  it("does not expose normalized drafts with stale legacy publication data", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user.data.isAdmin = false;
    authService.isAdmin.set(false);
    firestoreAdapter.getDocument.mockResolvedValue(
      buildEventDoc(
        "normalized-draft",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { publication_state: "draft", published: true },
      ),
    );

    await expect(
      service.getEventById("normalized-draft" as EventId),
    ).resolves.toBeNull();
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

    const events = await service.getEvents({ includeUnpublished: true });

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

    const values: (string | null)[] = [];
    const subscription = service
      .observeEventById("draft-event" as EventId)
      .subscribe((event) => values.push(event?.id ?? null));

    expect(values).toEqual(["draft-event"]);
    subscription.unsubscribe();
  });

  it("waits for authorization profile data before exposing a draft", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { uid: string; data?: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
      authState$: BehaviorSubject<unknown>;
      authorizationStateResolved: ReturnType<typeof signal<boolean>>;
      authorizationStateResolved$: BehaviorSubject<boolean>;
    };
    authService.user.data = undefined;
    authService.isAdmin.set(false);
    authService.authorizationStateResolved.set(false);
    authService.authorizationStateResolved$.next(false);
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

    const values: (string | null)[] = [];
    const subscription = service
      .observeEventById("draft-event" as EventId)
      .subscribe((event) => values.push(event?.id ?? null));

    await Promise.resolve();
    expect(values).toEqual([]);

    authService.user.data = { isAdmin: true };
    authService.isAdmin.set(true);
    authService.authorizationStateResolved.set(true);
    authService.authorizationStateResolved$.next(true);
    authService.authState$.next(authService.user);
    await Promise.resolve();

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

    const values: (string | null)[] = [];
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

  it("creates events with normalized defaults and explicit ownership", async () => {
    let stored: EventSchema | null = null;
    firestoreAdapter.setDocument.mockImplementation(
      (_path: string, data: EventSchema) => {
        stored = data;
        return Promise.resolve();
      },
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) =>
      Promise.resolve(path === "events/new-event" ? stored : null),
    );

    await service.createEvent(
      {
        name: "New event",
        venue_string: "Venue",
        locality_string: "Zurich",
        location_raw: { lat: 47.37, lng: 8.54 },
        start: Timestamp.fromDate(new Date("2026-08-01T10:00:00Z")),
        end: Timestamp.fromDate(new Date("2026-08-01T12:00:00Z")),
        published: false,
        event_categories: ["show"],
        owner: { type: "user", user_id: "admin-user" },
      },
      "new-event",
    );

    expect(firestoreAdapter.setDocument).toHaveBeenCalledWith(
      "events/new-event",
      expect.objectContaining({
        publication_state: "draft",
        published: false,
        visibility: "public",
        discoverability: { audience: "global" },
        kind: "festival",
        schedule_mode: "single",
        lifecycle_status: "planned",
        priority: "normal",
        owner: { type: "user", user_id: "admin-user" },
        attendance: {
          social: "rsvp",
          admission: "none",
          eligibility: { type: "everyone" },
        },
        notification_policy: "all",
      }),
    );
  });

  it("dual-writes normalized publication changes to the legacy field", async () => {
    firestoreAdapter.getDocument.mockResolvedValue(
      buildEventDoc(
        "event-1",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { publication_state: "draft", published: false },
      ),
    );

    await service.updateEvent("event-1" as EventId, {
      publication_state: "published",
    });

    expect(firestoreAdapter.updateDocument).toHaveBeenCalledWith(
      "events/event-1",
      expect.objectContaining({
        publication_state: "published",
        published: true,
      }),
    );
  });

  it("keeps legacy ownerless events editable until the backfill assigns an owner", async () => {
    firestoreAdapter.getDocument.mockResolvedValue(
      buildEventDoc(
        "legacy-event",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
        { created_by: undefined, owner: undefined },
      ),
    );

    await service.updateEvent("legacy-event" as EventId, {
      name: "Updated legacy event",
    });

    expect(firestoreAdapter.updateDocument).toHaveBeenCalledWith(
      "events/legacy-event",
      expect.objectContaining({ name: "Updated legacy event" }),
    );
  });

  it("allows a user owner to edit and manage collaborators", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { uid: string; data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user = { uid: "owner-1", data: { isAdmin: false } };
    authService.isAdmin.set(false);
    const owned = buildEventDoc(
      "owned-event",
      "2026-06-01T10:00:00.000Z",
      "2026-06-02T10:00:00.000Z",
      {
        owner: { type: "user", user_id: "owner-1" },
        publication_state: "published",
        visibility: "public",
      },
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "events/owned-event") return Promise.resolve(owned);
      return Promise.resolve(null);
    });

    await service.updateEvent("owned-event" as EventId, {
      venue_string: "Updated by owner",
    });
    const event = await service.getEventById("owned-event" as EventId);
    expect(event).not.toBeNull();
    await service.setEventAccess(event!, "collaborator-1", "collaborator");

    expect(firestoreAdapter.updateDocument).toHaveBeenCalledWith(
      "events/owned-event",
      expect.objectContaining({ venue_string: "Updated by owner" }),
    );
    expect(firestoreAdapter.setDocument).toHaveBeenCalledWith(
      "events/owned-event/access/collaborator-1",
      expect.objectContaining({
        user_id: "collaborator-1",
        role: "collaborator",
        granted_by: "owner-1",
      }),
    );
  });

  it("lets an explicit viewer open a private event without edit rights", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { uid: string; data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user = { uid: "viewer-1", data: { isAdmin: false } };
    authService.isAdmin.set(false);
    const privateEvent = buildEventDoc(
      "private-event",
      "2026-06-01T10:00:00.000Z",
      "2026-06-02T10:00:00.000Z",
      {
        owner: { type: "user", user_id: "owner-1" },
        publication_state: "published",
        visibility: "private",
        discoverability: { audience: "none" },
        viewer_policy: { audience: "invited" },
      },
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "events/private-event") return Promise.resolve(privateEvent);
      if (path === "events/private-event/access/viewer-1") {
        return Promise.resolve({ user_id: "viewer-1", role: "viewer" });
      }
      return Promise.resolve(null);
    });

    const event = await service.getEventById("private-event" as EventId);

    expect(event?.id).toBe("private-event");
    await expect(service.canEditEvent(event!)).resolves.toBe(false);
  });

  it("allows organization managers but not ordinary members to edit", async () => {
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { uid: string; data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user = { uid: "manager-1", data: { isAdmin: false } };
    authService.isAdmin.set(false);
    const organizationEvent = buildEventDoc(
      "organization-event",
      "2026-06-01T10:00:00.000Z",
      "2026-06-02T10:00:00.000Z",
      {
        owner: { type: "organization", organization_id: "club-1" },
      },
    );
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "events/organization-event") {
        return Promise.resolve(organizationEvent);
      }
      if (path === "organizations/club-1/members/manager-1") {
        return Promise.resolve({ role: "admin" });
      }
      return Promise.resolve(null);
    });

    await service.updateEvent("organization-event" as EventId, {
      venue_string: "Managed venue",
    });

    authService.user.uid = "member-1";
    firestoreAdapter.getDocument.mockImplementation((path: string) => {
      if (path === "events/organization-event") {
        return Promise.resolve(organizationEvent);
      }
      if (path === "organizations/club-1/members/member-1") {
        return Promise.resolve({ role: "member" });
      }
      return Promise.resolve(null);
    });
    await expect(
      service.updateEvent("organization-event" as EventId, {
        venue_string: "Member venue",
      }),
    ).rejects.toThrow("requires event editing privileges");
  });

  it("loads an organization's published events with current events first", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    const authService = TestBed.inject(AuthenticationService) as unknown as {
      user: { data: { isAdmin: boolean } };
      isAdmin: ReturnType<typeof signal<boolean>>;
    };
    authService.user.data.isAdmin = false;
    authService.isAdmin.set(false);
    firestoreAdapter.getCollection.mockResolvedValue([
      buildEventDoc(
        "past",
        "2026-05-01T10:00:00.000Z",
        "2026-05-02T10:00:00.000Z",
      ),
      buildEventDoc(
        "upcoming",
        "2026-06-01T10:00:00.000Z",
        "2026-06-02T10:00:00.000Z",
      ),
      buildEventDoc(
        "draft",
        "2026-05-25T10:00:00.000Z",
        "2026-05-26T10:00:00.000Z",
        { published: false },
      ),
    ]);

    const events = await service.getEventsForOrganization("pkspot");

    expect(firestoreAdapter.getCollection).toHaveBeenCalledWith(
      "event_discovery",
      [
        {
          fieldPath: "organizer.organization.id",
          opStr: "==",
          value: "pkspot",
        },
      ],
    );
    expect(events.map((event) => event.id)).toEqual(["upcoming", "past"]);
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
        time_updated_raw_ms: expect.any(Number),
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
        time_updated_raw_ms: expect.any(Number),
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

  it("replaces a PK Spot organizer with a plain-text organizer", async () => {
    await service.updateEvent("event-1" as EventId, {
      organizer: null,
      organizer_name: "Independent Jam Crew",
    });

    expect(firestoreAdapter.updateDocument).toHaveBeenCalledWith(
      "events/event-1",
      expect.objectContaining({
        organizer: deleteFieldMarker,
        organizer_name: "Independent Jam Crew",
      }),
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
