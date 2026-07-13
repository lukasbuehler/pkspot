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
