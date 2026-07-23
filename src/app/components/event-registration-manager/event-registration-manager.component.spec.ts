import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventRegistrationsService } from "../../services/firebase/firestore/event-registrations.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { EventRegistrationManagerComponent } from "./event-registration-manager.component";

const registrations = {
  listRegistrations: vi.fn(),
  cancel: vi.fn(),
};

const event = new PkEvent("event-1" as EventId, {
  name: "Managed registration",
  venue_string: "Gym",
  locality_string: "Zurich",
  location_raw: { lat: 47.37, lng: 8.54 },
  start: new Date(Date.now() + 86_400_000),
  end: new Date(Date.now() + 90_000_000),
  attendance: {
    social: "rsvp",
    admission: "registration",
    capacity: 20,
    waitlist: true,
  },
} as unknown as EventSchema);

describe("EventRegistrationManagerComponent", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    registrations.listRegistrations.mockResolvedValue([
      {
        id: "user-1",
        user_id: "user-1",
        event_id: "event-1",
        status: "registered",
        time_created: new Date(),
        time_updated: new Date(),
      },
    ]);
    registrations.cancel.mockResolvedValue({
      status: "cancelled",
      registered: 0,
      waitlisted: 0,
    });
    await TestBed.configureTestingModule({
      imports: [EventRegistrationManagerComponent],
      providers: [
        {
          provide: EventRegistrationsService,
          useValue: registrations,
        },
        {
          provide: UsersService,
          useValue: {
            getUserRefernceById: vi
              .fn()
              .mockResolvedValue({ uid: "user-1", display_name: "Traceur" }),
          },
        },
      ],
    })
      .overrideComponent(EventRegistrationManagerComponent, {
        set: { template: "" },
      })
      .compileComponents();
  });

  it("loads the organizer roster and cancels a selected attendee", async () => {
    const fixture = TestBed.createComponent(
      EventRegistrationManagerComponent,
    );
    fixture.componentRef.setInput("event", event);
    await fixture.whenStable();

    expect(fixture.componentInstance.rows()[0]?.user.display_name).toBe(
      "Traceur",
    );
    await fixture.componentInstance.cancelRegistration(
      fixture.componentInstance.rows()[0]!,
    );

    expect(registrations.cancel).toHaveBeenCalledWith("event-1", "user-1");
  });
});
