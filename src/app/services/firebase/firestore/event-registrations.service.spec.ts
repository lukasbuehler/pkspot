import { TestBed } from "@angular/core/testing";
import { BehaviorSubject, of } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationService } from "../authentication.service";
import { FirestoreAdapterService } from "../firestore-adapter.service";
import { FunctionsAdapterService } from "../functions-adapter.service";
import { EventRegistrationsService } from "./event-registrations.service";

describe("EventRegistrationsService", () => {
  let service: EventRegistrationsService;
  const authState$ = new BehaviorSubject<{ uid: string } | null>({
    uid: "user-1",
  });
  const firestore = {
    documentSnapshots: vi.fn(),
    getCollection: vi.fn(),
  };
  const functions = { call: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    authState$.next({ uid: "user-1" });
    firestore.documentSnapshots.mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [
        EventRegistrationsService,
        { provide: AuthenticationService, useValue: { authState$ } },
        { provide: FirestoreAdapterService, useValue: firestore },
        { provide: FunctionsAdapterService, useValue: functions },
      ],
    });
    service = TestBed.inject(EventRegistrationsService);
  });

  it("observes only the signed-in user's registration", async () => {
    const registration = {
      user_id: "user-1",
      event_id: "event-1",
      status: "registered" as const,
      time_created: new Date(),
      time_updated: new Date(),
    };
    firestore.documentSnapshots.mockReturnValue(of(registration));

    const result = await new Promise((resolve) =>
      service.observeMyRegistration("event-1").subscribe(resolve),
    );

    expect(firestore.documentSnapshots).toHaveBeenCalledWith(
      "events/event-1/registrations/user-1",
    );
    expect(result).toEqual(registration);
  });

  it("uses trusted callables for registration changes", async () => {
    functions.call
      .mockResolvedValueOnce({
        status: "registered",
        registered: 1,
        waitlisted: 0,
      })
      .mockResolvedValueOnce({
        status: "cancelled",
        registered: 0,
        waitlisted: 0,
      });

    await service.register("event-1");
    await service.cancel("event-1");

    expect(functions.call).toHaveBeenNthCalledWith(1, "registerForEvent", {
      eventId: "event-1",
    });
    expect(functions.call).toHaveBeenNthCalledWith(
      2,
      "cancelEventRegistration",
      { eventId: "event-1" },
    );
  });
});
