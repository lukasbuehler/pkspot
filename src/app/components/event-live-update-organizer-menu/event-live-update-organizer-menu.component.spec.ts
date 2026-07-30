import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { Timestamp } from "firebase/firestore";
import { BehaviorSubject } from "rxjs";
import { Event } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { EventLiveUpdateDialogComponent } from "../event-live-update-dialog/event-live-update-dialog.component";
import { EventLiveUpdateOrganizerMenuComponent } from "./event-live-update-organizer-menu.component";

const event = new Event("event-1" as EventId, {
  name: "City Jam",
  venue_string: "Main park",
  locality_string: "Zurich",
  start: Timestamp.fromDate(new Date("2099-07-21T10:00:00Z")),
  end: Timestamp.fromDate(new Date("2099-07-21T18:00:00Z")),
  published: true,
  organizer: {
    type: "organization",
    organization: { id: "org-1", name: "City Crew", slug: "city-crew" },
  },
} as unknown as EventSchema);

describe("EventLiveUpdateOrganizerMenuComponent", () => {
  it("shows organizer management and opens the publisher dialog", async () => {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "organizer-1" },
            authState$: new BehaviorSubject({ uid: "organizer-1" }),
          },
        },
        {
          provide: EventLiveUpdatesService,
          useValue: { canCurrentUserPublish: vi.fn(async () => true) },
        },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const fixture = TestBed.createComponent(EventLiveUpdateOrganizerMenuComponent);
    fixture.componentRef.setInput("event", event);
    await fixture.whenStable();
    expect(fixture.componentInstance.showMenu()).toBe(true);

    fixture.componentInstance.openPublisher();
    expect(open).toHaveBeenCalledWith(
      EventLiveUpdateDialogComponent,
      expect.objectContaining({ data: { event } }),
    );
  });

  it("offers ownership claims in the overflow menu", async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthenticationService,
          useValue: {
            user: { uid: "" },
            authState$: new BehaviorSubject(null),
          },
        },
        {
          provide: EventLiveUpdatesService,
          useValue: { canCurrentUserPublish: vi.fn(async () => false) },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(
      EventLiveUpdateOrganizerMenuComponent,
    );
    fixture.componentRef.setInput("event", event);
    fixture.componentRef.setInput("canRequestOwnership", true);
    const ownershipClaimRequested = vi.fn();
    fixture.componentInstance.ownershipClaimRequested.subscribe(
      ownershipClaimRequested,
    );

    await fixture.whenStable();

    expect(fixture.componentInstance.showMenu()).toBe(true);
    (fixture.nativeElement.querySelector("button") as HTMLButtonElement).click();
    await fixture.whenStable();

    const ownershipItem = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>(
        "button[mat-menu-item]",
      ),
    ).find((item) =>
      item.textContent?.includes("Request organization ownership"),
    );
    expect(ownershipItem).toBeDefined();
    ownershipItem?.click();
    await fixture.whenStable();

    expect(ownershipClaimRequested).toHaveBeenCalledOnce();
  });
});
