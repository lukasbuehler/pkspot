import { TestBed } from "@angular/core/testing";
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
} from "@angular/material/dialog";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { provideRouter } from "@angular/router";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../../services/analytics.service";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import type { EventSearchPreview } from "../../services/search.service";
import {
  EventDiscoveryIssuesDialogComponent,
  type EventDiscoveryIssuesDialogData,
} from "./event-discovery-issues-dialog.component";

const INVALID_EVENT: EventSearchPreview = {
  id: "missing-zone",
  slug: "missing-zone",
  name: "Event without a time zone",
  venueString: "Test Hall",
  localityString: "Zurich, Switzerland",
  isSponsored: false,
  hasOrganization: false,
  hasVenueSpot: false,
  venueSpotCount: 0,
  startSeconds: Date.parse("2026-08-14T10:00:00.000Z") / 1000,
  endSeconds: Date.parse("2026-08-14T18:00:00.000Z") / 1000,
  lifecycleStatus: "planned",
  eventLinks: [],
  ticketOptions: [],
  spotIds: [],
  communityKeys: ["country:ch"],
  seriesIds: [],
  eventCategories: ["jam"],
  rsvpCounts: { going: 2, interested: 1, notgoing: 0, total: 3 },
  seriesRoles: [],
  qualifiesToKeys: [],
  requiredQualifierKeys: [],
};

describe("EventDiscoveryIssuesDialogComponent", () => {
  it("renders invalid previews without formatting dates in the viewer time zone", async () => {
    const formatDateRange = vi.fn();
    const data: EventDiscoveryIssuesDialogData = {
      events: [INVALID_EVENT],
      seriesById: {},
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        {
          provide: DateTimeFormatService,
          useValue: { formatDateRange },
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
      ],
    });

    const fixture = TestBed.createComponent(
      EventDiscoveryIssuesDialogComponent,
    );
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("Event without a time zone");
    expect(text).toContain("Local time zone missing");
    expect(
      fixture.nativeElement.querySelectorAll("app-event-discovery-card"),
    ).toHaveLength(1);
    expect(formatDateRange).not.toHaveBeenCalled();
  });
});
