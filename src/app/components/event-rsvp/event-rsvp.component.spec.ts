import { ComponentFixture, TestBed } from "@angular/core/testing";
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

  it("leaves the visible counts unchanged after a save while the aggregate is stale", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("going");

    expect(component.loadedRsvp()).toBe("going");
    expect(component.displayCounts()).toEqual({
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
  });

  it("does not add my loaded response to the visible aggregate", async () => {
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
    expect(component.displayCounts()).toEqual({
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
  });

  it("shows updated counts only when the event aggregate changes", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("counts", {
      going: 0,
      interested: 0,
      notgoing: 0,
      total: 0,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    await component.selectRsvp("going");

    fixture.componentRef.setInput("counts", {
      going: 1,
      interested: 0,
      notgoing: 0,
      total: 1,
    });
    fixture.detectChanges();

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

  it("shows the selected RSVP in a menu button when a response is loaded", async () => {
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
      fixture.nativeElement.querySelector(".rsvp-menu-button"),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain("I'm");
  });

  it("prompts for an RSVP in the menu button when no response is loaded", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Are you going?");
    expect(fixture.nativeElement.querySelector(".rsvp-menu-button")).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain(
      "These numbers show PK Spot user intent, not tickets bought.",
    );
  });

  it("updates the menu button after saving an edited RSVP", async () => {
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

    await component.selectRsvp("interested");
    fixture.detectChanges();

    expect(component.selectedRsvp()).toBe("interested");
    expect(
      fixture.nativeElement.querySelector("mat-button-toggle-group"),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("interested");
    expect(fixture.nativeElement.textContent).toContain(
      "These numbers show PK Spot user intent, not tickets bought.",
    );
  });

  it("shows the RSVP prompt again after clearing a response", async () => {
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
    expect(fixture.nativeElement.textContent).toContain("Are you going?");
  });

  it("can hide the RSVP disclaimer", async () => {
    fixture.componentRef.setInput("eventId", "event-1");
    fixture.componentRef.setInput("showDisclaimer", false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).not.toContain(
      "These numbers show",
    );
  });
});
