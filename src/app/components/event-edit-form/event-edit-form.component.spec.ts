import { ComponentFixture, TestBed } from "@angular/core/testing";
import { describe, expect, it, vi } from "vitest";
import { Event as PkEvent } from "../../../db/models/Event";
import { EventId, EventSchema } from "../../../db/schemas/EventSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { MapsApiService } from "../../services/maps-api.service";
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
            searchPlaces: vi.fn().mockResolvedValue([]),
            searchSpots: vi.fn().mockResolvedValue({ hits: [], found: 0 }),
            getSpotPreviewFromHit: vi.fn(),
          },
        },
        {
          provide: AuthenticationService,
          useValue: {
            isAdmin: vi.fn(() => true),
          },
        },
        {
          provide: MapsApiService,
          useValue: {
            getGooglePlaceById: vi.fn(),
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

  it("emits a deletion marker when all existing event descriptions are removed", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        description_i18n: {
          en: { text: "Existing description", provider: "user" },
        },
      }),
    );
    fixture.detectChanges();

    component.descriptionLocaleMap = {};
    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].description_i18n).toBeNull();
  });

  it("prepends the legacy outer ring when compatibility is enabled", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    const mainArea = [
      { lat: 47.45, lng: 8.5 },
      { lat: 47.44, lng: 8.61 },
      { lat: 47.35, lng: 8.58 },
      { lat: 47.34, lng: 8.49 },
    ];
    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        area_polygon: [
          {
            area_name: "Main area",
            points: mainArea,
          },
        ],
      }),
    );
    fixture.detectChanges();

    component.form.patchValue({
      legacy_area_polygon_outer_ring: true,
    });
    (
      component as unknown as {
        _boundsPicker: { currentAreaPath: () => typeof mainArea };
      }
    )._boundsPicker = {
      currentAreaPath: () => mainArea,
    };

    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].area_polygon).toEqual([
      {
        points: [
          { lat: 0, lng: -90 },
          { lat: 0, lng: 90 },
          { lat: 90, lng: -90 },
          { lat: 90, lng: 90 },
        ],
      },
      {
        area_name: "Main area",
        points: mainArea,
      },
    ]);
  });

  it("keeps existing legacy compatibility unchanged unless the toggle changes", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    const mainArea = [
      { lat: 47.45, lng: 8.5 },
      { lat: 47.44, lng: 8.61 },
      { lat: 47.35, lng: 8.58 },
      { lat: 47.34, lng: 8.49 },
    ];
    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        area_polygon: [
          {
            points: [
              { lat: 0, lng: -90 },
              { lat: 0, lng: 90 },
              { lat: 90, lng: -90 },
              { lat: 90, lng: 90 },
            ],
          },
          {
            area_name: "Main area",
            points: mainArea,
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(component.form.value.legacy_area_polygon_outer_ring).toBe(true);
    (
      component as unknown as {
        _boundsPicker: { currentAreaPath: () => typeof mainArea };
      }
    )._boundsPicker = {
      currentAreaPath: () => mainArea,
    };

    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0]).not.toHaveProperty("area_polygon");
  });

  it("preserves the existing sponsor logo background color on submit", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        sponsor: {
          name: "Original Sponsor",
          url: "https://sponsor.example",
          logo_src: "assets/sponsors/original.png",
          logo_background_color: "#ffffff",
        },
      }),
    );
    fixture.detectChanges();

    component.form.patchValue({
      sponsor_name: "Updated Sponsor",
    });
    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].sponsor).toEqual({
      name: "Updated Sponsor",
      url: "https://sponsor.example",
      logo_src: "assets/sponsors/original.png",
      logo_background_color: "#ffffff",
    });
  });

  it("uses display-sized image URLs for media previews", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const storageUrl =
      "https://firebasestorage.googleapis.com/v0/b/parkour-base-project.appspot.com/o/event_media%2Fbanner.png?alt=media";

    component.form.patchValue({ banner_src: storageUrl });

    expect(component.previewImageSrc("banner_src")).toBe(
      "https://firebasestorage.googleapis.com/v0/b/parkour-base-project.appspot.com/o/event_media%2Fbanner_800x800.png?alt=media",
    );
  });

  it("serializes temporary event spots with local bounds on submit", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput("event", eventWith("event-1"));
    fixture.detectChanges();

    component.addInlineSpot();
    const spotKey = component.inlineSpots()[0].key;
    component.updateInlineSpot(spotKey, {
      id: "main-stage",
      name: "Main stage",
      description: "Temporary event build.",
      imagesCsv: "https://example.com/stage.webp",
      isIconic: true,
    });
    component.updateInlineSpotCoordinate(spotKey, "lat", 47.37);
    component.updateInlineSpotCoordinate(spotKey, "lng", 8.54);
    component.addInlineSpotBoundsPoint(spotKey);
    component.addInlineSpotBoundsPoint(spotKey);
    component.addInlineSpotBoundsPoint(spotKey);
    const points = component.inlineSpots()[0].bounds;
    component.updateInlineSpotBoundsPoint(spotKey, points[0].id, "lat", 47.371);
    component.updateInlineSpotBoundsPoint(spotKey, points[0].id, "lng", 8.541);
    component.updateInlineSpotBoundsPoint(spotKey, points[1].id, "lat", 47.372);
    component.updateInlineSpotBoundsPoint(spotKey, points[1].id, "lng", 8.542);
    component.updateInlineSpotBoundsPoint(spotKey, points[2].id, "lat", 47.373);
    component.updateInlineSpotBoundsPoint(spotKey, points[2].id, "lng", 8.543);

    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].inline_spots).toEqual([
      {
        id: "main-stage",
        name: "Main stage",
        location: { lat: 47.37, lng: 8.54 },
        description: "Temporary event build.",
        images: ["https://example.com/stage.webp"],
        bounds: [
          { lat: 47.371, lng: 8.541 },
          { lat: 47.372, lng: 8.542 },
          { lat: 47.373, lng: 8.543 },
        ],
        is_iconic: true,
      },
    ]);
  });

  it("serializes rich custom marker fields on submit", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput("event", eventWith("event-1"));
    fixture.detectChanges();

    component.addCustomMarker();
    const markerId = component.customMarkers()[0].id;
    component.updateCustomMarker(markerId, {
      name: "Info stand",
      description: "Pick up your wristband here.",
      locality: "Main hall",
      googlePlaceId: "google-place-1",
      url: "https://example.com/info",
      imageUrl: "https://example.com/info.jpg",
      icons: "info, help",
      color: "tertiary",
      priority: "required",
    });
    component.updateCustomMarkerCoordinate(markerId, "lat", 47.37);
    component.updateCustomMarkerCoordinate(markerId, "lng", 8.54);

    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].custom_markers).toEqual([
      {
        id: markerId,
        name: "Info stand",
        description: "Pick up your wristband here.",
        locality: "Main hall",
        google_place_id: "google-place-1",
        url: "https://example.com/info",
        media: [
          {
            src: "https://example.com/info.jpg",
            type: "image",
            isInStorage: false,
            origin: "other",
          },
        ],
        location: { lat: 47.37, lng: 8.54 },
        icons: ["info", "help"],
        color: "tertiary",
        priority: "required",
      },
    ]);
  });

  it("serializes featured people, groups and acts on submit", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput("event", eventWith("event-1"));
    fixture.detectChanges();

    component.addFeaturedParticipant();
    const athleteId = component.featuredParticipants()[0].id;
    component.updateFeaturedParticipant(athleteId, {
      name: "Featured Athlete",
      role: "athlete",
      type: "person",
      description: "Guest athlete.",
      url: "https://athlete.example/profile",
      imageSrc: "https://athlete.example/photo.jpg",
    });

    component.addFeaturedParticipant();
    const hostId = component.featuredParticipants()[1].id;
    component.updateFeaturedParticipant(hostId, {
      name: "Invalid URL Host",
      role: "host",
      type: "group",
      url: "javascript:alert(1)",
    });

    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].featured_participants).toEqual([
      {
        name: "Featured Athlete",
        role: "athlete",
        type: "person",
        description: "Guest athlete.",
        url: "https://athlete.example/profile",
        image_src: "https://athlete.example/photo.jpg",
      },
      {
        name: "Invalid URL Host",
        role: "host",
        type: "group",
        description: undefined,
        url: undefined,
        image_src: undefined,
      },
    ]);
  });

  it("writes promoted state with the legacy sponsored mirror", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        is_promoted: true,
        promo_radius_m: 25_000,
      }),
    );
    fixture.detectChanges();

    component.form.patchValue({
      promo_radius_m: 30_000,
      is_promoted: true,
    });
    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        promo_radius_m: 30_000,
        is_promoted: true,
        is_sponsored: true,
      }),
    );
  });

  it("serializes edited program plans and items on submit", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        program: {
          active_plan_id: "main",
          plans: [
            {
              id: "main",
              label: "Main program",
              kind: "main",
              items: [
                {
                  id: "jam",
                  title: "Jam",
                  category: "jam",
                  start: "2026-06-01T10:00:00.000Z",
                  end: "2026-06-01T12:00:00.000Z",
                  spot_ref: { kind: "spot", id: "spot-1" },
                },
              ],
            },
          ],
        },
      }),
    );
    fixture.detectChanges();

    component.updateProgramItem("main", "jam", {
      title: "Open jam",
      linkedEventId: "linked-event",
    });
    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].program).toEqual(
      expect.objectContaining({
        active_plan_id: "main",
        plans: [
          expect.objectContaining({
            id: "main",
            label: "Main program",
            items: [
              expect.objectContaining({
                id: "jam",
                title: "Open jam",
                category: "jam",
                spot_ref: { kind: "spot", id: "spot-1" },
                linked_event_id: "linked-event",
              }),
            ],
          }),
        ],
      }),
    );
  });

  it("serializes series memberships and qualification paths on submit", async () => {
    const fixture = await setup();
    const component = fixture.componentInstance;
    const saveSpy = vi.fn();
    component.save.subscribe(saveSpy);

    fixture.componentRef.setInput(
      "event",
      eventWith("event-1", {
        series_ids: ["parkour-earth"],
        series_memberships: [
          {
            series_id: "parkour-earth",
            role: "qualifier",
            qualification_required: true,
            qualification_hint: "Swiss athletes qualify through Swiss Jam.",
            qualification_paths: [
              {
                id: "swiss-pathway",
                label: "Swiss pathway",
                requirement_mode: "any",
                requirements: [
                  {
                    kind: "program_item",
                    event_id: "swissjam26",
                    program_item_id: "swiss-parkour-championships",
                  },
                ],
              },
            ],
            qualifies_to: [
              {
                kind: "event",
                event_id: "parkour-earth-world-championships-2026",
              },
            ],
          },
        ],
      }),
    );
    fixture.detectChanges();

    component.updateQualificationPathRequirementMode(
      "membership-0",
      "swiss-pathway",
      "all",
    );
    component.onSubmit();

    expect(saveSpy).toHaveBeenCalledOnce();
    expect(saveSpy.mock.calls[0][0].series_ids).toEqual(["parkour-earth"]);
    expect(saveSpy.mock.calls[0][0].series_memberships).toEqual([
      expect.objectContaining({
        series_id: "parkour-earth",
        role: "qualifier",
        qualification_required: true,
        qualification_hint: "Swiss athletes qualify through Swiss Jam.",
        qualifies_to: [
          {
            kind: "event",
            event_id: "parkour-earth-world-championships-2026",
            program_item_id: undefined,
          },
        ],
        qualification_paths: [
          expect.objectContaining({
            id: "swiss-pathway",
            label: "Swiss pathway",
            requirement_mode: "all",
            requirements: [
              {
                kind: "program_item",
                event_id: "swissjam26",
                program_item_id: "swiss-parkour-championships",
              },
            ],
          }),
        ],
      }),
    ]);
  });
});
