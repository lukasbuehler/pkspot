import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatButtonToggleChange } from "@angular/material/button-toggle";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { EventRsvpComponent } from "./event-rsvp.component";

describe("EventRsvpComponent", () => {
  let component: EventRsvpComponent;
  let fixture: ComponentFixture<EventRsvpComponent>;
  const authState$ = new BehaviorSubject<{ uid: string } | null>({
    uid: "user-1",
  });
  const eventsService = {
    getMyRsvp: vi.fn(() => Promise.resolve(null)),
    setMyRsvp: vi.fn(() => Promise.resolve()),
    clearMyRsvp: vi.fn(() => Promise.resolve()),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    authState$.next({ uid: "user-1" });
    eventsService.getMyRsvp.mockResolvedValue(null);
    eventsService.setMyRsvp.mockResolvedValue(undefined);
    eventsService.clearMyRsvp.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [EventRsvpComponent],
      providers: [
        { provide: EventsService, useValue: eventsService },
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "user-1" },
            authState$,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventRsvpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("keeps the optimistic count after a save while the aggregate is stale", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.onRsvpChange({
      value: "going",
    } as MatButtonToggleChange);

    expect(component.loadedRsvp()).toBe("going");
    expect(component.countedRsvp()).toBeNull();
    expect(component.displayCounts()).toEqual({
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
  });

  it("counts my loaded RSVP after refresh when the aggregate is stale", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.selectedRsvp()).toBe("going");
    expect(component.countedRsvp()).toBeNull();
    expect(component.displayCounts()).toEqual({
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
  });

  it("settles optimistic counts once the event aggregate catches up", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.onRsvpChange({
      value: "going",
    } as MatButtonToggleChange);

    fixture.componentRef.setInput("counts", {
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
    fixture.detectChanges();

    expect(component.countedRsvp()).toBe("going");
    expect(component.displayCounts()).toEqual({
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
  });
});
