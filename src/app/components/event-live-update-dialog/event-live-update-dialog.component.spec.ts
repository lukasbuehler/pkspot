import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Timestamp } from "firebase/firestore";
import { Event } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { SpotSelectionDataService } from "../../services/spot-selection-data.service";
import { EventLiveUpdateDialogComponent } from "./event-live-update-dialog.component";

const event = new Event("event-1" as EventId, {
  name: "City Jam",
  venue_string: "Main park",
  locality_string: "Zurich",
  start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
  end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
  inline_spots: [{ id: "west", name: "West entrance", location: { lat: 1, lng: 1 } }],
} as unknown as EventSchema);

describe("EventLiveUpdateDialogComponent", () => {
  it("validates copy, previews recipients, and publishes through the callable", async () => {
    const publish = vi.fn(async () => ({ updateId: "update-1" }));
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { event } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: EventLiveUpdatesService, useValue: { publish } },
        { provide: SpotSelectionDataService, useValue: { resolve: vi.fn() } },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(EventLiveUpdateDialogComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll("mat-form-field")).toHaveLength(5);
    expect(fixture.nativeElement.querySelectorAll("mat-select")).toHaveLength(2);

    fixture.componentInstance.formModel.update((model) => ({
      ...model,
      title: "Meet at the west entrance",
      eventSpotId: "west",
    }));
    fixture.componentInstance.showPreview();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain("Notification preview");
    expect(fixture.nativeElement.textContent).toContain(
      "People subscribed to this event",
    );

    await fixture.componentInstance.publishUpdate();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        title: "Meet at the west entrance",
        eventSpotId: "west",
      }),
    );
    expect(close).toHaveBeenCalledWith(true);
  });
});
