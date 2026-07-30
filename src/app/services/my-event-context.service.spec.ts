import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BehaviorSubject, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../db/models/Event";
import type { EventId, EventSchema } from "../../db/schemas/EventSchema";
import { AuthenticationService } from "./firebase/authentication.service";
import { EventsService } from "./firebase/firestore/events.service";
import { EventLiveUpdatesService } from "./firebase/firestore/event-live-updates.service";
import { EventRegistrationsService } from "./firebase/firestore/event-registrations.service";
import { MyEventContextService } from "./my-event-context.service";

const buildEvent = (id: string): PkEvent =>
  new PkEvent(id as EventId, {
    name: id,
    start: "2026-07-30T08:00:00Z",
    end: "2026-07-30T18:00:00Z",
    time_zone: "UTC",
  } as unknown as EventSchema);

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("MyEventContextService", () => {
  const authState = new BehaviorSubject({ uid: "user-1" });
  const events = {
    getEventById: vi.fn(),
    getMyRsvp: vi.fn(),
  };
  const liveUpdates = {
    observeCurrentUserSubscriptions: vi.fn(),
  };
  const registrations = {
    observeMyRegistration: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T10:30:00Z"));
    authState.next({ uid: "user-1" });
    events.getEventById.mockImplementation(async (id: string) => buildEvent(id));
    events.getMyRsvp.mockResolvedValue(null);
    liveUpdates.observeCurrentUserSubscriptions.mockReturnValue(
      of([
        { eventId: "going", level: "all" },
        { eventId: "registered", level: "reminders" },
        { eventId: "interested", level: "all" },
      ]),
    );
    registrations.observeMyRegistration.mockReturnValue(of(null));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "user-1" },
            authState$: authState,
          },
        },
        { provide: EventsService, useValue: events },
        { provide: EventLiveUpdatesService, useValue: liveUpdates },
        { provide: EventRegistrationsService, useValue: registrations },
        { provide: PLATFORM_ID, useValue: "browser" },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows only live events with verified going or registered attendance", async () => {
    events.getMyRsvp.mockImplementation(async (id: string) =>
      id === "going" || id === "interested"
        ? {
            user_id: "user-1",
            event_id: id,
            rsvp: id,
            time_updated: new Date(),
          }
        : null,
    );
    registrations.observeMyRegistration.mockImplementation((id: string) =>
      of(
        id === "registered"
          ? {
              user_id: "user-1",
              event_id: id,
              status: "registered",
              time_created: new Date(),
              time_updated: new Date(),
            }
          : null,
      ),
    );

    const service = TestBed.inject(MyEventContextService);
    vi.useRealTimers();
    await flush();

    expect(service.liveEvents().map(({ id }) => id)).toEqual([
      "going",
      "registered",
    ]);
    expect(service.hasLiveEvent()).toBe(true);
  });
});
