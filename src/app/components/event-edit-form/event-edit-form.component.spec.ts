import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { SearchService } from "../../services/search.service";
import { EventEditFormComponent } from "./event-edit-form.component";

const baseEvent = {
  name: "Editable Event",
  venue_string: "Old venue",
  locality_string: "Zurich, Switzerland",
  spot_ids: [],
  location_raw: { lat: 47.3769, lng: 8.5417 },
  start: "2026-06-01T10:00:00.000Z",
  end: "2026-06-01T12:00:00.000Z",
  bounds: {
    north: 47.5,
    south: 47.3,
    east: 8.7,
    west: 8.4,
  },
} satisfies Partial<EventSchema>;

function eventWith(
  id: string,
  extra: Partial<EventSchema> = {},
): PkEvent {
  return new PkEvent(id as EventId, {
    ...baseEvent,
    ...extra,
  } as EventSchema);
}

describe("EventEditFormComponent", () => {
  async function setup(): Promise<ComponentFixture<EventEditFormComponent>> {
    await TestBed.configureTestingModule({
      imports: [EventEditFormComponent],
      providers: [
        {
          provide: SearchService,
          useValue: {
            listCommunities: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            getOrganizations: vi.fn().mockResolvedValue([]),
            makeReference: vi.fn((organization) => organization),
          },
        },
      ],
    })
      .overrideComponent(EventEditFormComponent, {
        set: { template: "" },
      })
      .compileComponents();

    return TestBed.createComponent(EventEditFormComponent);
  }

  it("does not replace an edited area with bounds when the same event refreshes", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;

    fixture.componentRef.setInput("event", eventWith("event-1"));
    fixture.detectChanges();

    const drawnArea = [
      { lat: 47.45, lng: 8.5 },
      { lat: 47.44, lng: 8.61 },
      { lat: 47.35, lng: 8.58 },
      { lat: 47.34, lng: 8.49 },
    ];
    component.onAreaChange(drawnArea);

    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        bounds: {
          north: 47.9,
          south: 47.1,
          east: 8.9,
          west: 8.1,
        },
      }),
    );
    fixture.detectChanges();

    expect(component.areaPath()).toEqual(drawnArea);
    expect(component.areaTouched()).toBe(true);
  });

  it("includes a live picker area on submit even when areaChange did not fire", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput("event", eventWith("event-1"));
    fixture.detectChanges();

    component.form.patchValue({
      name: "Editable Event",
      venue_string: "New venue",
      locality_string: "Zurich, Switzerland",
      location_lat: 47.3769,
      location_lng: 8.5417,
      start_date: new Date("2026-06-01T10:00:00.000Z"),
      start_time: new Date("2026-06-01T10:00:00.000Z"),
      end_date: new Date("2026-06-01T12:00:00.000Z"),
      end_time: new Date("2026-06-01T12:00:00.000Z"),
      published: true,
    });
    const liveArea = [
      { lat: 47.45, lng: 8.5 },
      { lat: 47.44, lng: 8.61 },
      { lat: 47.35, lng: 8.58 },
      { lat: 47.34, lng: 8.49 },
    ];
    (component as unknown as { _boundsPicker: { currentAreaPath: () => typeof liveArea } })._boundsPicker = {
      currentAreaPath: () => liveArea,
    };

    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].area_polygon).toEqual([
      {
        area_name: "Main area",
        points: liveArea,
      },
    ]);
  });
});
