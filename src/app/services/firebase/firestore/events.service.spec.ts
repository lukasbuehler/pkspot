import { TestBed } from "@angular/core/testing";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject, Observable } from "rxjs";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { EventId, EventSchema } from "../../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../analytics.service";
import { AssetUrlService } from "../../asset-url.service";
import { ConsentService } from "../../consent.service";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { EventsService } from "./events.service";

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
          useValue: { user: { uid: "admin-user", data: { isAdmin: true } } },
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
});
