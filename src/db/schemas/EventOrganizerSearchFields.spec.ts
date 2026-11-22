// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventSchema } from "./EventSchema";
import {
  EVENT_DISCOVERY_FIELDS,
  buildEventDiscoveryProjection,
} from "./EventDiscoverySchema";
import {
  EVENT_ORGANIZER_SEARCH_FIELD_NAMES,
  deriveEventOrganizerSearchFields,
} from "./EventOrganizerSearchFields";

const organization = {
  id: "org-1",
  name: "Parkour Zurich",
  slug: "parkour-zurich",
  logo_url: "https://example.test/logo.png",
  logo_background_color: "#ffffff",
};

describe("deriveEventOrganizerSearchFields", () => {
  it("maps an organization organizer with logo and slug", () => {
    expect(
      deriveEventOrganizerSearchFields({
        organizer: { type: "organization", organization },
        organizer_name: "Ignored plain name",
      }),
    ).toEqual({
      organizer_kind: "organization",
      organizer_display_name: "Parkour Zurich",
      organizer_organization_id: "org-1",
      organizer_organization_slug: "parkour-zurich",
      organizer_logo_url: "https://example.test/logo.png",
      organizer_logo_background_color: "#ffffff",
    });
  });

  it("omits an organization's missing logo instead of writing empty values", () => {
    expect(
      deriveEventOrganizerSearchFields({
        organizer: {
          type: "organization",
          organization: { id: "org-2", name: "Crew", slug: "crew" },
        },
      }),
    ).toEqual({
      organizer_kind: "organization",
      organizer_display_name: "Crew",
      organizer_organization_id: "org-2",
      organizer_organization_slug: "crew",
    });
  });

  it("maps a community member with only the public snapshot", () => {
    const fields = deriveEventOrganizerSearchFields({
      organizer_user: {
        uid: "user-1",
        display_name: "Alex",
        profile_picture: "https://example.test/alex.jpg",
        // A stray private field on the snapshot must never be copied.
        email: "alex@example.test",
      } as EventSchema["organizer_user"],
    });

    expect(fields).toEqual({
      organizer_kind: "user",
      organizer_display_name: "Alex",
      organizer_user_id: "user-1",
      organizer_user_avatar_url: "https://example.test/alex.jpg",
    });
  });

  it("keeps a nameless community member as a user organizer", () => {
    expect(
      deriveEventOrganizerSearchFields({ organizer_user: { uid: "user-2" } }),
    ).toEqual({ organizer_kind: "user", organizer_user_id: "user-2" });
  });

  it("falls back to the plain organizer name like Event.organizerName", () => {
    expect(
      deriveEventOrganizerSearchFields({
        organizer_user: { uid: "user-3" },
        organizer_name: "Jam crew",
      }).organizer_display_name,
    ).toBe("Jam crew");
    expect(
      deriveEventOrganizerSearchFields({ organizer_name: "  Jam crew  " }),
    ).toEqual({ organizer_kind: "name", organizer_display_name: "Jam crew" });
  });

  it.each([
    [{}],
    [{ organizer_name: "   " }],
    [{ organizer_user: { uid: "" } }],
  ])("returns no fields without a usable organizer (%o)", (event) => {
    expect(deriveEventOrganizerSearchFields(event)).toEqual({});
  });
});

describe("organizer search fields in the discovery projection", () => {
  const event = (patch: Partial<EventSchema>): EventSchema =>
    ({
      name: "Public jam",
      start: { seconds: 1, nanoseconds: 0 },
      end: { seconds: 2, nanoseconds: 0 },
      published: true,
      ...patch,
    }) as unknown as EventSchema;

  it("projects every organizer search field", () => {
    for (const field of EVENT_ORGANIZER_SEARCH_FIELD_NAMES) {
      expect(EVENT_DISCOVERY_FIELDS).toContain(field);
    }

    const derived = deriveEventOrganizerSearchFields({
      organizer: { type: "organization", organization },
    });
    expect(buildEventDiscoveryProjection(event(derived))).toEqual(
      expect.objectContaining(derived),
    );
  });

  it("clears organizer fields when they are removed from the event", () => {
    const projection = buildEventDiscoveryProjection(event({}));
    for (const field of EVENT_ORGANIZER_SEARCH_FIELD_NAMES) {
      expect(projection).not.toHaveProperty(field);
    }
  });

  it("is registered as a server-derived helper field the indexer deletes", () => {
    // `_getChangedFields` deletes absent TYPESENSE_HELPER_FIELDS, which is how
    // a removed organizer clears its stale search fields.
    const source = readFileSync(
      join(process.cwd(), "functions/src/eventFunctions.ts"),
      "utf8",
    );
    const helperFields = /const TYPESENSE_HELPER_FIELDS = \[([\s\S]*?)\] as const;/u
      .exec(source)?.[1];
    expect(helperFields).toContain("...EVENT_ORGANIZER_SEARCH_FIELD_NAMES");
    expect(source).toContain(
      "Object.assign(out, deriveEventOrganizerSearchFields(eventData));",
    );
  });

  it("keeps clients from writing the organizer search fields", () => {
    const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
    const computed = /function eventComputedFields\(\) \{([\s\S]*?)\];/u.exec(
      rules,
    )?.[1];
    for (const field of EVENT_ORGANIZER_SEARCH_FIELD_NAMES) {
      expect(computed).toContain(`'${field}'`);
    }
  });
});
