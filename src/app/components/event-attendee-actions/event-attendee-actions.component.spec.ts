import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventRSVPOption } from "../../../db/schemas/EventRSVPSchema";
import { EventAttendeeActionsComponent } from "./event-attendee-actions.component";

@Component({
  selector: "app-event-rsvp",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EventRsvpStub {
  readonly eventId = input<string | null>(null);
  readonly counts = input<unknown>(null);
  readonly defaultNotificationLevel = input("all");
  readonly rsvpChanged = output<EventRSVPOption | null>();
}

@Component({
  selector: "app-event-registration",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EventRegistrationStub {
  readonly event = input.required<PkEvent>();
}

@Component({
  selector: "app-event-live-update-controls",
  template: "",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class EventLiveUpdateControlsStub {
  readonly event = input.required<PkEvent>();
}

describe("EventAttendeeActionsComponent", () => {
  let fixture: ComponentFixture<EventAttendeeActionsComponent>;
  const event = {
    id: "event-1",
    rsvpCounts: { going: 2, interested: 1, notgoing: 0, total: 3 },
    notificationPolicy: "all",
  } as unknown as PkEvent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [EventAttendeeActionsComponent],
    });
    TestBed.overrideComponent(EventAttendeeActionsComponent, {
      set: {
        imports: [
          EventLiveUpdateControlsStub,
          EventRegistrationStub,
          EventRsvpStub,
        ],
      },
    });
    await TestBed.compileComponents();

    fixture = TestBed.createComponent(EventAttendeeActionsComponent);
    fixture.componentRef.setInput("event", event);
  });

  it("composes RSVP, registration, and notification controls", async () => {
    fixture.componentRef.setInput("showRsvp", true);
    fixture.componentRef.setInput("showRegistration", true);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector("app-event-rsvp")).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector("app-event-registration"),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector("app-event-live-update-controls"),
    ).toBeTruthy();
  });

  it("re-emits RSVP changes", async () => {
    const changed = vi.fn();
    fixture.componentInstance.rsvpChanged.subscribe(changed);
    fixture.componentRef.setInput("showRsvp", true);
    await fixture.whenStable();

    const rsvp = fixture.debugElement.query(By.directive(EventRsvpStub))
      .componentInstance as EventRsvpStub;
    rsvp.rsvpChanged.emit("going");

    expect(changed).toHaveBeenCalledWith("going");
  });
});
