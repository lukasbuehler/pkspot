import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Timestamp } from "firebase/firestore";
import { Event } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { EventOperationsDialogComponent } from "./event-operations-dialog.component";

const event = new Event("event-1" as EventId, {
  name: "City Jam",
  published: true,
  lifecycle_status: "planned",
  start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
  end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
  time_updated: Timestamp.fromMillis(123_000),
} as EventSchema);

describe("EventOperationsDialogComponent", () => {
  it("requires a cancellation reason and submits one atomic request", async () => {
    const applyOperationalChange = vi.fn(async () => ({
      operationId: "operation-1",
      updateId: "operation-1",
    }));
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { event } },
        { provide: MatDialogRef, useValue: { close } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: EventLiveUpdatesService, useValue: { applyOperationalChange } },
      ],
    });
    const fixture = TestBed.createComponent(EventOperationsDialogComponent);
    const component = fixture.componentInstance;

    expect(component.canPreview()).toBe(false);
    component.reason.set("Severe storm warning");
    expect(component.canPreview()).toBe(true);

    await component.apply();

    expect(applyOperationalChange).toHaveBeenCalledWith({
      eventId: "event-1",
      expectedUpdatedAtMs: 123_000,
      operation: "cancel_event",
      reason: "Severe storm warning",
    });
    expect(close).toHaveBeenCalledWith(true);
  });
});
