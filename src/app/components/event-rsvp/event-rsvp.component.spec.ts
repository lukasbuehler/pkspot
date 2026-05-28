import { ComponentFixture, TestBed } from "@angular/core/testing";
import { MatButtonToggleChange } from "@angular/material/button-toggle";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
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
        provideNoopAnimations(),
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

  it("uses fancy counters in the visible aggregate counts", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 2,
      interested: 1,
      notgoing: 0,
      total: 3,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      fixture.nativeElement.querySelectorAll("app-fancy-counter"),
    ).toHaveLength(2);
  });

  it("hides RSVP controls behind an edit summary when a response is loaded", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Edit RSVP"]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain("I'm");
  });

  it("reveals RSVP controls from the edit summary", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Edit RSVP"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeTruthy();
  });

  it("collapses back to the summary after saving an edited RSVP", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    component.isEditingRsvp.set(true);
    await component.onRsvpChange({
      value: "interested",
    } as MatButtonToggleChange);
    fixture.detectChanges();

    expect(component.selectedRsvp()).toBe("interested");
    expect(component.isEditingRsvp()).toBe(false);
    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeNull();
  });

  it("shows RSVP controls again after clearing a response", async () => {
    eventsService.getMyRsvp.mockResolvedValue({
      user_id: "user-1",
      event_id: "event-1",
      rsvp: "going",
      time_created: new Date(),
      time_updated: new Date(),
    });
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();

    await component.clearRsvp();
    fixture.detectChanges();

    expect(component.selectedRsvp()).toBeNull();
    expect(component.isEditingRsvp()).toBe(false);
    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeTruthy();
  });
});
