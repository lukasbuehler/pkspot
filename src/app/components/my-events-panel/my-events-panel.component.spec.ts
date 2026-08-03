import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { describe, expect, it } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { DateTimeFormatService } from "../../services/date-time-format.service";
import { MyEventsPanelComponent } from "./my-events-panel.component";

const buildEvent = (
  extra: Partial<EventSchema> = {},
  id = "wpf-camp",
): PkEvent =>
  new PkEvent(id as EventId, {
    name: "WPF Camp 2026",
    slug: "wpf-camp-2026",
    venue_string: "Campingplatz Waldhort",
    start: "2026-08-05T10:00:00Z",
    end: "2026-08-09T18:00:00Z",
    time_zone: "Europe/Berlin",
    ...extra,
  } as unknown as EventSchema);

describe("MyEventsPanelComponent", () => {
  function createComponent(event: PkEvent) {
    TestBed.configureTestingModule({
      imports: [MyEventsPanelComponent],
      providers: [
        provideRouter([]),
        {
          provide: DateTimeFormatService,
          useValue: { formatDateRange: () => "05.–09.08.26" },
        },
      ],
    });
    const fixture = TestBed.createComponent(MyEventsPanelComponent);
    fixture.componentRef.setInput("goingEvents", [event]);
    return fixture;
  }

  it("shows the event badge logo when one is available", async () => {
    const fixture = createComponent(
      buildEvent({
        logo_src: "https://example.com/wpf-camp.png",
        logo_fit: "cover",
        logo_background_color: "#ffffff",
      }),
    );

    await fixture.whenStable();

    const icon = fixture.debugElement.query(By.css(".my-event-icon"));
    const image = icon.query(By.css("img")).nativeElement as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(
      "https://example.com/wpf-camp.png",
    );
    expect(image.style.objectFit).toBe("cover");
    expect((icon.nativeElement as HTMLElement).style.backgroundColor).toBe(
      "rgb(255, 255, 255)",
    );
    expect(icon.query(By.css("mat-icon"))).toBeNull();
  });

  it("falls back to the event glyph when no badge logo is available", async () => {
    const fixture = createComponent(buildEvent());

    await fixture.whenStable();

    expect(
      fixture.debugElement.query(By.css(".my-event-icon mat-icon"))
        .nativeElement.textContent,
    ).toContain("event");
    expect(fixture.debugElement.query(By.css(".my-event-icon img"))).toBeNull();
  });

  it("keeps past saved events in a separate tab", async () => {
    const now = new Date("2026-08-03T12:00:00Z");
    const upcoming = buildEvent({}, "upcoming-event");
    const past = buildEvent(
      {
        name: "British Parkour Championships",
        slug: "british-parkour-championships",
        start: "2026-08-01T10:00:00Z",
        end: "2026-08-02T18:00:00Z",
      },
      "past-event",
    );
    const fixture = createComponent(upcoming);
    fixture.componentRef.setInput("goingEvents", []);
    fixture.componentRef.setInput("savedEvents", [upcoming, past]);
    fixture.componentRef.setInput("now", now);

    await fixture.whenStable();

    expect(fixture.componentInstance.selectedTab()).toBe("saved");
    expect(fixture.componentInstance.rows().map(({ event }) => event.id)).toEqual([
      "upcoming-event",
    ]);
    expect(
      fixture.debugElement.query(By.css('mat-button-toggle[value="saved"]'))
        .nativeElement.textContent,
    ).toContain("1");
    expect(
      fixture.debugElement.query(By.css('mat-button-toggle[value="past"]'))
        .nativeElement.textContent,
    ).toContain("1");

    (
      fixture.debugElement.query(
        By.css('mat-button-toggle[value="past"] button'),
      ).nativeElement as HTMLButtonElement
    ).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.selectedTab()).toBe("past");
    expect(fixture.componentInstance.rows().map(({ event }) => event.id)).toEqual([
      "past-event",
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      "British Parkour Championships",
    );
  });
});
