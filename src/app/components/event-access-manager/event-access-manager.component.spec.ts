import { ComponentFixture, TestBed } from "@angular/core/testing";
import { vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { UsersService } from "../../services/firebase/firestore/users.service";
import { SearchService } from "../../services/search.service";
import { EventAccessManagerComponent } from "./event-access-manager.component";

const event = new PkEvent("private-event" as EventId, {
  name: "Private training",
  venue_string: "Gym",
  locality_string: "Zurich",
  location_raw: { lat: 47.37, lng: 8.54 },
  start: "2026-08-01T10:00:00.000Z",
  end: "2026-08-01T12:00:00.000Z",
  owner: { type: "user", user_id: "owner-1" },
} as EventSchema);

describe("EventAccessManagerComponent", () => {
  let fixture: ComponentFixture<EventAccessManagerComponent>;
  const listEventAccess = vi.fn();
  const setEventAccess = vi.fn();
  const removeEventAccess = vi.fn();

  beforeEach(async () => {
    listEventAccess.mockReset();
    listEventAccess.mockResolvedValue([]);
    setEventAccess.mockReset();
    setEventAccess.mockResolvedValue(undefined);
    removeEventAccess.mockReset();
    removeEventAccess.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [EventAccessManagerComponent],
      providers: [
        {
          provide: EventsService,
          useValue: { listEventAccess, setEventAccess, removeEventAccess },
        },
        {
          provide: UsersService,
          useValue: {
            getUserRefernceById: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: SearchService,
          useValue: {
            searchUsers: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    })
      .overrideComponent(EventAccessManagerComponent, {
        set: { template: "" },
      })
      .compileComponents();

    fixture = TestBed.createComponent(EventAccessManagerComponent);
    fixture.componentRef.setInput("event", event);
    await fixture.whenStable();
  });

  it("loads the event's explicit access grants", () => {
    expect(listEventAccess).toHaveBeenCalledWith(event);
    expect(fixture.componentInstance.rows()).toEqual([]);
  });

  it("adds a pasted user ID with the selected role", async () => {
    const component = fixture.componentInstance;
    component.selectedUserId.set("viewer-1");
    component.roleControl.setValue("collaborator");

    await component.addGrant();

    expect(setEventAccess).toHaveBeenCalledWith(
      event,
      "viewer-1",
      "collaborator",
    );
    expect(component.selectedUserId()).toBe("");
  });
});
