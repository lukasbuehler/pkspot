import { LOCALE_ID } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { MatTooltip } from "@angular/material/tooltip";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { MapIslandComponent } from "./map-island.component";
import { beforeEach, describe, expect, it } from "vitest";

function buildEvent(isPromoted: boolean): PkEvent {
  return new PkEvent("map-island-event" as EventId, {
    name: "WPF Camp 2026",
    venue_string: "Basel",
    locality_string: "Basel, Switzerland",
    start: "2026-08-01T10:00:00.000Z",
    end: "2026-08-08T18:00:00.000Z",
    is_promoted: isPromoted,
  } as EventSchema);
}

describe("MapIslandComponent", () => {
  let fixture: ComponentFixture<MapIslandComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapIslandComponent],
      providers: [
        { provide: LOCALE_ID, useValue: "en" },
        provideNoopAnimations(),
      ],
    });
    fixture = TestBed.createComponent(MapIslandComponent);
  });

  it("uses explicit broadcast status even when the Typesense preview has no video URL", () => {
    const now = Date.now();
    const event = new PkEvent("broadcast" as EventId, {
      name: "World Championships", start: new Date(now - 60000).toISOString(),
      end: new Date(now + 60000).toISOString(),
      livestream_live: true,
    } as unknown as EventSchema);
    fixture.componentRef.setInput("content", {kind: "event", event});
    fixture.detectChanges();
    expect(fixture.componentInstance.hasBroadcast()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("Watch the broadcast");
    expect(fixture.nativeElement.textContent).not.toContain("Live on YouTube");
    const replay = new PkEvent("broadcast" as EventId, {
      name: "World Championships", start: new Date(now - 60000).toISOString(),
      end: new Date(now + 60000).toISOString(), livestream_live: false,
      media: [{type: "video", src: "https://youtu.be/uG9SCwcHA7k", isInStorage: false}],
      event_links: [{kind: "livestream", label: "Watch", url: "https://youtu.be/uG9SCwcHA7k"}],
    } as unknown as EventSchema);
    fixture.componentRef.setInput("content", {kind: "event", event: replay});
    fixture.detectChanges();
    expect(fixture.componentInstance.hasBroadcast()).toBe(false);
    expect(replay.media).toHaveLength(1);
    fixture.componentRef.setInput("content", {kind: "event", event: new PkEvent("past" as EventId, {
      name: "Ended event", start: new Date(now - 120000).toISOString(),
      end: new Date(now - 60000).toISOString(), livestream_live: true,
    } as unknown as EventSchema)});
    fixture.detectChanges();
    expect(fixture.componentInstance.hasBroadcast()).toBe(false);
  });

  it("gives a promoted event dismissal an accessible label and tooltip", () => {
    fixture.componentRef.setInput("content", {
      kind: "event",
      event: buildEvent(true),
    });
    fixture.detectChanges();

    const dismissButton = fixture.debugElement.query(
      By.css('button[aria-label="Hide this promotion"]'),
    );
    const tooltip = dismissButton.injector.get(MatTooltip);

    expect(dismissButton).toBeTruthy();
    expect(tooltip.message).toBe("Hide this promotion");
    expect(dismissButton.query(By.css("mat-icon")).attributes["aria-hidden"]).toBe(
      "true",
    );
  });

  it("uses an event-specific label for non-promoted events", () => {
    fixture.componentRef.setInput("content", {
      kind: "event",
      event: buildEvent(false),
    });
    fixture.detectChanges();

    expect(
      fixture.debugElement.query(
        By.css('button[aria-label="Hide this event"]'),
      ),
    ).toBeTruthy();
  });
});
