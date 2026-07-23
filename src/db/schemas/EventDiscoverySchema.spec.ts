import { describe, expect, it } from "vitest";
import { EventSchema } from "./EventSchema";
import {
  EVENT_DISCOVERY_FIELDS,
  buildEventDiscoveryProjection,
  isEventOpenableByKnownReference,
  isEventPubliclyDiscoverable,
} from "./EventDiscoverySchema";

const event = (patch: Partial<EventSchema> = {}): EventSchema =>
  ({
    name: "Public jam",
    venue_string: "Main Hall",
    locality_string: "Zurich",
    location: { latitude: 47.37, longitude: 8.54 },
    location_raw: { lat: 47.37, lng: 8.54 },
    start: { seconds: 1, nanoseconds: 0 },
    end: { seconds: 2, nanoseconds: 0 },
    published: true,
    ...patch,
  }) as unknown as EventSchema;

describe("event discovery projection", () => {
  it("keeps legacy published events publicly discoverable by default", () => {
    expect(isEventPubliclyDiscoverable(event())).toBe(true);
  });

  it.each(["draft", "unlisted", "private"] as const)(
    "excludes %s events from discovery",
    (state) => {
      const source =
        state === "draft"
          ? event({ publication_state: "draft" })
          : event({ visibility: state });
      expect(isEventPubliclyDiscoverable(source)).toBe(false);
      expect(buildEventDiscoveryProjection(source)).toBeNull();
    },
  );

  it("allows known links only for published public and unlisted events", () => {
    expect(isEventOpenableByKnownReference(event())).toBe(true);
    expect(
      isEventOpenableByKnownReference(event({ visibility: "unlisted" })),
    ).toBe(true);
    expect(
      isEventOpenableByKnownReference(event({ visibility: "private" })),
    ).toBe(false);
    expect(
      isEventOpenableByKnownReference(event({ publication_state: "draft" })),
    ).toBe(false);
  });

  it("copies only approved public fields", () => {
    const projection = buildEventDiscoveryProjection(
      event({
        slug: "public-jam",
        program: { active_plan_id: "main", plans: [] },
        owner: { type: "user", user_id: "owner-1" },
        created_by: { uid: "admin-1" },
      }),
    );

    expect(projection).toMatchObject({
      slug: "public-jam",
      publication_state: "published",
      visibility: "public",
      published: true,
    });
    expect(projection).not.toHaveProperty("program");
    expect(projection).not.toHaveProperty("owner");
    expect(projection).not.toHaveProperty("created_by");
  });

  it("keeps sensitive and full-detail fields out of the allowlist", () => {
    expect(EVENT_DISCOVERY_FIELDS).not.toContain("program");
    expect(EVENT_DISCOVERY_FIELDS).not.toContain("owner");
    expect(EVENT_DISCOVERY_FIELDS).not.toContain("created_by");
    expect(EVENT_DISCOVERY_FIELDS).not.toContain("media");
    expect(EVENT_DISCOVERY_FIELDS).not.toContain("custom_markers");
    expect(EVENT_DISCOVERY_FIELDS).not.toContain("area_polygon");
  });
});
