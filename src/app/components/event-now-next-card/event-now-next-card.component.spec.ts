import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import type { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AppSettingsService } from "../../services/app-settings.service";
import { EventNowNextCardComponent } from "./event-now-next-card.component";

const event = new PkEvent("live-event" as EventId, {
  name: "City Jam",
  slug: "city-jam",
  start: "2026-07-30T08:00:00Z",
  end: "2026-07-30T18:00:00Z",
  time_zone: "UTC",
  program: {
    active_plan_id: "main",
    plans: [
      {
        id: "main",
        label: "Main",
        kind: "main",
        items: [
          {
            id: "speed",
            title: "Speed qualifiers",
            category: "competition",
            start: "2026-07-30T10:00:00Z",
            end: "2026-07-30T11:00:00Z",
          },
          {
            id: "workshop",
            title: "Workshop",
            category: "workshop",
            start: "2026-07-30T12:00:00Z",
            end: "2026-07-30T13:00:00Z",
          },
        ],
      },
    ],
  },
} as unknown as EventSchema);

describe("EventNowNextCardComponent", () => {
  let fixture: ComponentFixture<EventNowNextCardComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AppSettingsService,
          useValue: { timeFormat: signal("24-hour") },
        },
      ],
    });
    fixture = TestBed.createComponent(EventNowNextCardComponent);
    fixture.componentRef.setInput("event", event);
    fixture.componentRef.setInput("now", new Date("2026-07-30T10:30:00Z"));
  });

  it("shows the current and next program items", async () => {
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain("Live now");
    expect(fixture.nativeElement.textContent).toContain("Speed qualifiers");
    expect(fixture.nativeElement.textContent).toContain("Workshop");
  });

  it("emits the current item when opening the program", async () => {
    const selected = vi.fn();
    fixture.componentInstance.itemSelected.subscribe(selected);
    await fixture.whenStable();

    (
      fixture.nativeElement.querySelector(
        ".event-now-actions button",
      ) as HTMLButtonElement
    ).click();

    expect(selected).toHaveBeenCalledWith("speed");
  });

  it("links the overview treatment to the event", async () => {
    fixture.componentRef.setInput("showEventName", true);
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector(
      ".event-now-actions a",
    ) as HTMLAnchorElement;
    expect(fixture.nativeElement.textContent).toContain("City Jam");
    expect(link.getAttribute("href")).toBe("/events/city-jam");
  });
});
