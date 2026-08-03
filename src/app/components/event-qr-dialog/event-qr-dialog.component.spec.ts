import { TestBed } from "@angular/core/testing";
import { MAT_DIALOG_DATA } from "@angular/material/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AnalyticsService } from "../../services/analytics.service";
import {
  EventQrDialogComponent,
  type EventQrDialogData,
} from "./event-qr-dialog.component";

const event = new PkEvent("event-1" as EventId, {
  name: "Parkour Weekend",
  slug: "parkour-weekend",
  start: new Date("2026-08-08T08:00:00Z"),
  end: new Date("2026-08-09T18:00:00Z"),
} as unknown as EventSchema);

describe("EventQrDialogComponent", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventQrDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            event,
            url: "https://pkspot.app/events/parkour-weekend?intent=add&utm_source=event_qr",
          } satisfies EventQrDialogData,
        },
        {
          provide: AnalyticsService,
          useValue: { trackEvent: vi.fn() },
        },
      ],
    });
  });

  it("generates a downloadable QR code for the stable event URL", async () => {
    const fixture = TestBed.createComponent(EventQrDialogComponent);

    await vi.waitFor(() =>
      expect(fixture.componentInstance.qrDataUrl()).toMatch(
        /^data:image\/png;base64,/u,
      ),
    );
  });
});
