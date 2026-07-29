import { GeoPoint } from "firebase/firestore";
import { LocalSpot } from "../../db/models/Spot";
import type { EventProgramItem } from "../../db/models/Event";
import type { SpotSchema } from "../../db/schemas/SpotSchema";
import {
  effectiveProgramItem,
  eventProgramDays,
  eventProgramSpotRefs,
  eventProgramSpotVisits,
  resolveEventProgramOccurrences,
  smartEventProgramDay,
} from "./event-program-spots";

function localSpot(name: string): LocalSpot {
  return new LocalSpot(
    {
      name: { en: { text: name, provider: "user" } },
      location: new GeoPoint(47.3, 8.5),
      location_raw: { lat: 47.3, lng: 8.5 },
      address: null,
      media: [],
      amenities: {},
    } as SpotSchema,
    "en",
  );
}

function item(
  patch: Partial<EventProgramItem> = {},
): EventProgramItem {
  return {
    id: "training",
    title: "Training",
    category: "workshop",
    start: new Date("2026-08-05T10:00:00Z"),
    end: new Date("2026-08-05T12:00:00Z"),
    spot_ref: { kind: "spot", id: "legacy" },
    ...patch,
  };
}

describe("event program Spot helpers", () => {
  it("prefers deduplicated spot_refs and falls back to spot_ref", () => {
    expect(eventProgramSpotRefs(item())).toEqual([
      { kind: "spot", id: "legacy" },
    ]);
    expect(
      eventProgramSpotRefs(
        item({
          spot_refs: [
            { kind: "spot", id: "a" },
            { kind: "spot", id: "a" },
            { kind: "inline_spot", id: "a" },
          ],
        }),
      ),
    ).toEqual([
      { kind: "spot", id: "a" },
      { kind: "inline_spot", id: "a" },
    ]);
  });

  it("uses runtime overrides and excludes cancelled occurrences", () => {
    const moved = item({
      runtimeOverride: {
        start: new Date("2026-08-06T14:00:00Z"),
        end: new Date("2026-08-06T16:00:00Z"),
        status: "moved",
      },
    });
    expect(effectiveProgramItem(moved)).toEqual({
      start: new Date("2026-08-06T14:00:00Z"),
      end: new Date("2026-08-06T16:00:00Z"),
      status: "moved",
    });
    expect(
      resolveEventProgramOccurrences(
        [item({ status: "cancelled" })],
        [{ ref: { kind: "spot", id: "legacy" }, spot: localSpot("Legacy") }],
        "UTC",
      ),
    ).toEqual([]);
  });

  it("groups multiple visits, choosing active then next and exposing a count", () => {
    const spot = localSpot("Main stage");
    const bindings = [
      { ref: { kind: "spot" as const, id: "legacy" }, spot },
    ];
    const items = [
      item(),
      item({
        id: "later",
        start: new Date("2026-08-05T14:00:00Z"),
        end: new Date("2026-08-05T15:00:00Z"),
      }),
    ];
    const now = new Date("2026-08-05T10:30:00Z");
    const occurrences = resolveEventProgramOccurrences(
      items,
      bindings,
      "UTC",
      now,
    );
    const visits = eventProgramSpotVisits(occurrences, "2026-08-05", now);

    expect(visits).toHaveLength(1);
    expect(visits[0].occurrences).toHaveLength(2);
    expect(visits[0].representative.item.id).toBe("training");
    expect(visits[0].representative.isActive).toBe(true);
  });

  it("uses event-local day keys and selects today, next, then final day", () => {
    const days = eventProgramDays(
      [
        item({ start: new Date("2026-08-04T23:00:00Z") }),
        item({ id: "next", start: new Date("2026-08-06T08:00:00Z") }),
      ],
      "Europe/Zurich",
    );
    expect(days).toEqual(["2026-08-05", "2026-08-06"]);
    expect(
      smartEventProgramDay(
        days,
        "Europe/Zurich",
        new Date("2026-08-05T08:00:00Z"),
      ),
    ).toBe("2026-08-05");
    expect(
      smartEventProgramDay(
        days,
        "Europe/Zurich",
        new Date("2026-08-04T08:00:00Z"),
      ),
    ).toBe("2026-08-05");
    expect(
      smartEventProgramDay(
        days,
        "Europe/Zurich",
        new Date("2026-08-07T08:00:00Z"),
      ),
    ).toBe("2026-08-06");
  });
});
