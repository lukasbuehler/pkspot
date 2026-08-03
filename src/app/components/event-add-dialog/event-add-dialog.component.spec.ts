import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { provideRouter } from "@angular/router";
import { signal } from "@angular/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { MyEventsService } from "../../services/my-events.service";
import {
  EventAddDialogComponent,
  type EventAddDialogData,
} from "./event-add-dialog.component";

const event = new PkEvent("event-1" as EventId, {
  name: "Parkour Weekend",
  slug: "parkour-weekend",
  start: new Date("2026-08-08T08:00:00Z"),
  end: new Date("2026-08-09T18:00:00Z"),
  notification_policy: "reminders",
} as unknown as EventSchema);

describe("EventAddDialogComponent", () => {
  const userId = signal<string | null>("user-1");
  const myEvents = {
    userId,
    relationshipFor: vi.fn(() => null),
    saveEvent: vi.fn(),
    markGoing: vi.fn(),
  };
  const dialogRef = { close: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    userId.set("user-1");
    myEvents.saveEvent.mockResolvedValue(undefined);
    myEvents.markGoing.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      imports: [EventAddDialogComponent],
      providers: [
        provideRouter([]),
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            event,
            returnUrl: "/events/parkour-weekend?intent=add",
            source: "event_qr",
          } satisfies EventAddDialogData,
        },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MyEventsService, useValue: myEvents },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
      ],
    });
  });

  it("offers distinct Save and Going actions to signed-in users", async () => {
    const fixture = TestBed.createComponent(EventAddDialogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Save event");
    expect(fixture.nativeElement.textContent).toContain("I'm going");

    await fixture.componentInstance.choose("going");

    expect(myEvents.markGoing).toHaveBeenCalledWith("event-1", "reminders");
    expect(dialogRef.close).toHaveBeenCalledWith("going");
  });

  it("saves locally and offers sign-in when signed out", async () => {
    userId.set(null);
    const fixture = TestBed.createComponent(EventAddDialogComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      "Sign in to mark Going",
    );
    expect(fixture.nativeElement.textContent).toContain("Save on this device");

    await fixture.componentInstance.choose("saved");

    expect(myEvents.saveEvent).toHaveBeenCalledWith("event-1", "reminders");
    expect(dialogRef.close).toHaveBeenCalledWith("saved");
  });
});
