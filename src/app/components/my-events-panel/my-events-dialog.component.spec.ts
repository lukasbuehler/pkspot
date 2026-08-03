import { TestBed } from "@angular/core/testing";
import { MatButtonToggleGroup } from "@angular/material/button-toggle";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { MyEventsDialogComponent } from "./my-events-dialog.component";
import type { MyEventsDialogData } from "./my-events.types";

const buildEvent = (id: string, name: string): PkEvent =>
  new PkEvent(id as EventId, {
    name,
    slug: id,
    start: "2026-08-05T10:00:00Z",
    end: "2026-08-05T12:00:00Z",
    time_zone: "Europe/Zurich",
  } as unknown as EventSchema);

describe("MyEventsDialogComponent", () => {
  it("opens on the selected tab and lets users browse every group", async () => {
    const data: MyEventsDialogData = {
      goingEvents: [buildEvent("going-event", "Going event")],
      savedEvents: [buildEvent("saved-event", "Saved event")],
      pastEvents: [buildEvent("past-event", "Past event")],
      initialTab: "saved",
    };
    const dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [MyEventsDialogComponent],
      providers: [
        provideRouter([]),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: DateTimeFormatService,
          useValue: { formatDateRange: () => "05.08.26" },
        },
      ],
    });
    const fixture = TestBed.createComponent(MyEventsDialogComponent);

    await fixture.whenStable();

    const header = fixture.debugElement.query(By.css(".dialog-header"));
    const content = fixture.debugElement.query(By.css("mat-dialog-content"));
    const tabs = header.query(By.css("mat-button-toggle-group"));
    expect(tabs).not.toBeNull();
    expect(tabs.injector.get(MatButtonToggleGroup).hideSingleSelectionIndicator).toBe(
      true,
    );
    expect(content.query(By.css("mat-button-toggle-group"))).toBeNull();
    expect(content.query(By.css("app-my-event-list"))).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("Saved event");
    (
      fixture.debugElement.query(
        By.css('mat-button-toggle[value="past"] button'),
      ).nativeElement as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Past event");
    expect(fixture.nativeElement.textContent).not.toContain("Saved event");

    fixture.componentInstance.closeAfterSelection();
    expect(dialogRef.close).toHaveBeenCalledOnce();
  });
});
