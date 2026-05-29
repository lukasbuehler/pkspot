import { describe, expect, it } from "vitest";
import { Event } from "./Event";
import { EventId, EventSchema } from "../schemas/EventSchema";

const baseEvent = {
  name: "Test Event",
  venue_string: "Test Venue",
  locality_string: "Test City",
  spot_ids: [],
  bounds: {
    north: 47,
    south: 46,
    east: 8,
    west: 7,
  },
} satisfies Partial<EventSchema>;

describe("Event", () => {
  it("parses Firestore timestamp-like dates with string seconds", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: { seconds: "1781431200", nanoseconds: "0" },
      end: { seconds: "1781517600", nanoseconds: "0" },
    } as EventSchema);

    expect(event.start.toISOString()).toBe("2026-06-14T10:00:00.000Z");
    expect(event.end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
    expect(Number.isFinite(event.start.getTime())).toBe(true);
    expect(Number.isFinite(event.end.getTime())).toBe(true);
  });

  it("parses admin SDK timestamp-like dates", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: { _seconds: 1781431200, _nanoseconds: 123_000_000 },
      end: { _seconds: 1781517600, _nanoseconds: 0 },
    } as EventSchema);

    expect(event.start.toISOString()).toBe("2026-06-14T10:00:00.123Z");
    expect(event.end.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("prefers location_raw as the event pin location", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      location_raw: { lat: 47.3769, lng: 8.5417 },
      location: { latitude: 46.948, longitude: 7.4474 },
    } as EventSchema);

    expect(event.location).toEqual({ lat: 47.3769, lng: 8.5417 });
  });

  it("exposes circle promo geometry for ranking overlapping promotions", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      promo_region: {
        center: { lat: 47.3769, lng: 8.5417 },
        radius_m: 25_000,
      },
    } as EventSchema);

    expect(event.promoCenter()).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(event.promoRadiusMeters()).toBe(25_000);
    expect(
      event.distanceFromPromoCenterMeters({ lat: 47.3769, lng: 8.5417 })
    ).toBe(0);
    expect(
      event.containsPromoPoint({ lat: 47.3769, lng: 8.5417 })
    ).toBe(true);
    expect(event.containsPromoPoint({ lat: 48.8566, lng: 2.3522 })).toBe(
      false
    );
  });

  it("uses promo_radius_m as promo geometry centered on the event location", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      location_raw: { lat: 47.3769, lng: 8.5417 },
      promo_radius_m: 30_000,
    } as EventSchema);

    expect(event.promoCenter()).toEqual({ lat: 47.3769, lng: 8.5417 });
    expect(event.promoRadiusMeters()).toBe(30_000);
    expect(
      event.containsPromoPoint({ lat: 47.3769, lng: 8.5417 })
    ).toBe(true);
  });

  it("normalizes event links and ticket option dates", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      event_links: [
        {
          label: "Schedule",
          url: "https://example.com/schedule",
          kind: "schedule",
        },
      ],
      ticket_options: [
        {
          id: "early",
          label: "Early bird",
          price: { amount: 35, currency: "CHF" },
          sale_ends_at: "2026-06-01T00:00:00.000Z",
          badge: "early_bird",
        },
      ],
    } as EventSchema);

    expect(event.eventLinks[0].kind).toBe("schedule");
    expect(event.ticketOptions[0]).toEqual(
      expect.objectContaining({
        id: "early",
        label: "Early bird",
        price: { amount: 35, currency: "CHF" },
        badge: "early_bird",
      }),
    );
    expect(event.ticketOptions[0].saleEndsAt?.toISOString()).toBe(
      "2026-06-01T00:00:00.000Z",
    );
  });

  it("uses localized descriptions when available", () => {
    const event = new Event(
      "event-1" as EventId,
      {
        ...baseEvent,
        start: "2026-06-14T10:00:00.000Z",
        end: "2026-06-15T10:00:00.000Z",
        description: "Fallback description",
        description_i18n: {
          de: { text: "Deutsche Beschreibung", provider: "test" },
          en: { text: "English description", provider: "test" },
        },
      } as EventSchema,
      "de-CH",
    );

    expect(event.description).toBe("Deutsche Beschreibung");
    expect(event.descriptions?.de?.text).toBe("Deutsche Beschreibung");
  });

  it("normalizes event program dates, linked events, and runtime overrides", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-08-05T14:00:00.000Z",
      end: "2026-08-09T15:00:00.000Z",
      event_categories: ["camp", "competition"],
      time_zone: "Europe/Zurich",
      program: {
        active_plan_id: "main",
        plans: [
          {
            id: "main",
            label: "Main program",
            kind: "main",
            items: [
              {
                id: "skills",
                title: "WPF Skills Competition",
                category: "competition",
                start: "2026-08-08T09:00:00.000Z",
                end: "2026-08-08T12:00:00.000Z",
                linked_event_id: "wpf-skills-competition-2026",
                participation: {
                  access: "included_with_event",
                  note: "Included with WPF Camp ticket.",
                },
                runtime_override: {
                  start: "2026-08-08T09:30:00.000Z",
                  status: "delayed",
                  note: "Warm-up moved by 30 minutes.",
                },
                series_memberships: [
                  {
                    series_id: "swiss-parkour-tour",
                    role: "qualifier",
                    disciplines: ["skill"],
                    qualifies_to: [
                      {
                        kind: "program_item",
                        event_id: "swissjam26",
                        program_item_id: "swiss-parkour-championships",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    } as unknown as EventSchema);

    expect(event.eventCategories).toEqual(["camp", "competition"]);
    expect(event.timeZone).toBe("Europe/Zurich");
    expect(event.program?.active_plan_id).toBe("main");
    expect(event.program?.plans[0].items[0]).toEqual(
      expect.objectContaining({
        id: "skills",
        title: "WPF Skills Competition",
        category: "competition",
        linked_event_id: "wpf-skills-competition-2026",
      }),
    );
    expect(event.program?.plans[0].items[0].start.toISOString()).toBe(
      "2026-08-08T09:00:00.000Z",
    );
    expect(event.program?.plans[0].items[0].end?.toISOString()).toBe(
      "2026-08-08T12:00:00.000Z",
    );
    expect(
      event.program?.plans[0].items[0].runtimeOverride?.start?.toISOString(),
    ).toBe("2026-08-08T09:30:00.000Z");
    expect(event.program?.plans[0].items[0].runtimeOverride?.status).toBe(
      "delayed",
    );
  });

  it("combines legacy series ids with rich series memberships", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-08-29T08:00:00.000Z",
      end: "2026-08-30T14:00:00.000Z",
      series_ids: ["swiss-parkour-tour"],
      series_memberships: [
        {
          series_id: "swiss-parkour-tour",
          role: "championship",
          qualification_required: true,
          qualification_hint:
            "Participation requires qualification through Swiss Parkour Tour events.",
          required_qualifiers: [
            {
              kind: "event",
              event_id: "parkour-day-staefa-2026",
            },
          ],
          qualifies_to: [
            {
              kind: "event",
              event_id: "parkour-earth-worlds-2026",
            },
          ],
        },
        {
          series_id: "parkour-earth",
          role: "qualifier",
        },
      ],
    } as unknown as EventSchema);

    expect(event.seriesIds).toEqual([
      "swiss-parkour-tour",
      "parkour-earth",
    ]);
    expect(event.seriesMemberships[0]).toEqual(
      expect.objectContaining({
        series_id: "swiss-parkour-tour",
        role: "championship",
        qualification_required: true,
      }),
    );
    expect(event.seriesMemberships[0].required_qualifiers?.[0]).toEqual({
      kind: "event",
      event_id: "parkour-day-staefa-2026",
    });
  });

  it("derives bounds promo geometry for ranking overlapping promotions", () => {
    const event = new Event("event-1" as EventId, {
      ...baseEvent,
      start: "2026-06-14T10:00:00.000Z",
      end: "2026-06-15T10:00:00.000Z",
      promo_region: {
        bounds: {
          north: 47.7,
          south: 47.3,
          east: 8.0,
          west: 7.6,
        },
      },
    } as EventSchema);

    expect(event.promoCenter()).toEqual({ lat: 47.5, lng: 7.8 });
    expect(event.promoRadiusMeters()).toBeGreaterThan(20_000);
    expect(event.promoRadiusMeters()).toBeLessThan(35_000);
    expect(event.containsPromoPoint({ lat: 47.5, lng: 7.8 })).toBe(true);
    expect(event.containsPromoPoint({ lat: 46.9, lng: 7.8 })).toBe(false);
  });
});
