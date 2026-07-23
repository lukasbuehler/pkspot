import { describe, expect, it } from "vitest";
import {
  displayedEventLifecycle,
  eventIsPublished,
  eventKindFromLegacyCategories,
  normalizeEventModel,
} from "./EventNormalization";
import { EventSchema } from "./EventSchema";

describe("event model normalization", () => {
  it("treats normalized publication state as canonical over legacy data", () => {
    expect(
      eventIsPublished({ publication_state: "draft", published: true }),
    ).toBe(false);
    expect(
      eventIsPublished({ publication_state: "published", published: false }),
    ).toBe(true);
    expect(eventIsPublished({ published: false })).toBe(false);
  });

  it.each([
    [["competition", "camp"], "other"],
    [["workshop", "show"], "other"],
    [["camp"], "festival"],
    [["camp", "show", "awards"], "festival"],
    [["show", "social"], "other"],
    [["jam"], "session"],
    [["jam", "social", "travel"], "session"],
    [["other"], "other"],
    [[], "other"],
  ] as const)("maps legacy categories %j to %s", (categories, expected) => {
    expect(eventKindFromLegacyCategories([...categories])).toBe(expected);
  });

  it("adds defaults without inferring permissions from legacy created_by", () => {
    const result = normalizeEventModel({
      published: false,
      created_by: { uid: "creator-1" },
      event_categories: ["camp", "competition"],
    });

    expect(result.invalid).toEqual([]);
    expect(result.patch).toEqual({
      publication_state: "draft",
      visibility: "public",
      discoverability: { audience: "global" },
      kind: "other",
      schedule_mode: "single",
      lifecycle_status: "planned",
      priority: "normal",
      notification_policy: "all",
      attendance: {
        social: "rsvp",
        admission: "none",
        eligibility: { type: "everyone" },
      },
    });
  });

  it("does not add a legacy category for an inferred fallback kind", () => {
    const result = normalizeEventModel({
      event_categories: ["camp", "competition"],
    });

    expect(result.patch.kind).toBe("other");
    expect(result.patch.event_categories).toBeUndefined();
  });

  it("requires explicit ownership only when requested for new events", () => {
    const result = normalizeEventModel(
      { created_by: { uid: "historical-creator" } },
      { requireOwner: true },
    );

    expect(result.invalid).toContain("owner");
    expect(result.patch.owner).toBeUndefined();
  });

  it("defaults private event policies without inferring an audience", () => {
    const result = normalizeEventModel({
      visibility: "private",
      attendance: {
        social: "rsvp",
        admission: "registration",
        eligibility: {
          type: "organization_members",
          organization_id: "club-1",
        },
      },
    });

    expect(result.invalid).toEqual([]);
    expect(result.patch).toEqual(
      expect.objectContaining({
        discoverability: { audience: "none" },
        viewer_policy: { audience: "invited" },
      }),
    );
  });

  it("requires organization ids on organization-scoped policies", () => {
    const result = normalizeEventModel({
      discoverability: {
        audience: "organization_members",
      } as unknown as EventSchema["discoverability"],
      viewer_policy: {
        audience: "organization_members",
      } as unknown as EventSchema["viewer_policy"],
      attendance: {
        social: "rsvp",
        admission: "none",
        eligibility: {
          type: "organization_members",
        },
      } as unknown as EventSchema["attendance"],
    });

    expect(result.invalid).toEqual([
      "discoverability",
      "viewer_policy",
      "attendance",
    ]);
  });

  it("keeps explicit choices and dual-writes their legacy equivalents", () => {
    const result = normalizeEventModel({
      publication_state: "published",
      published: false,
      visibility: "unlisted",
      discoverability: { audience: "none" },
      kind: "class",
      schedule_mode: "recurring",
      lifecycle_status: "cancelled",
      priority: "featured",
      notification_policy: "reminders",
      attendance: {
        social: "none",
        admission: "registration",
        capacity: 12,
        waitlist: true,
      },
      owner: { type: "organization", organization_id: "team-1" },
      event_categories: ["social"],
    });

    expect(result.invalid).toEqual([]);
    expect(result.patch).toEqual({
      published: true,
      event_categories: ["social", "workshop"],
    });
  });

  it("is idempotent once all normalized and compatibility fields exist", () => {
    const normalized: Partial<EventSchema> = {
      publication_state: "published",
      published: true,
      visibility: "public",
      discoverability: { audience: "global" },
      kind: "festival",
      schedule_mode: "multi_part",
      lifecycle_status: "planned",
      priority: "normal",
      notification_policy: "all",
      attendance: { social: "rsvp", admission: "none" },
      owner: { type: "user", user_id: "owner-1" },
      event_categories: ["camp"],
    };

    expect(normalizeEventModel(normalized)).toEqual({ patch: {}, invalid: [] });
  });

  it("reports invalid normalized fields instead of silently replacing them", () => {
    const result = normalizeEventModel({
      publication_state: "invalid" as EventSchema["publication_state"],
      visibility: "secret" as EventSchema["visibility"],
      attendance: {
        social: "none",
        admission: "none",
        capacity: 10,
      },
      owner: { type: "user", user_id: "" },
    });

    expect(result.invalid).toEqual([
      "publication_state",
      "visibility",
      "attendance",
      "owner",
    ]);
  });

  it("uses an explicit fallback owner when a reviewed migration requests one", () => {
    const result = normalizeEventModel(
      { event_categories: ["jam"] },
      { fallbackOwner: { type: "user", user_id: "migration-owner" } },
    );

    expect(result.invalid).toEqual([]);
    expect(result.patch.owner).toEqual({
      type: "user",
      user_id: "migration-owner",
    });
  });
});

describe("displayed event lifecycle", () => {
  const start = new Date("2026-08-01T10:00:00Z");
  const end = new Date("2026-08-01T12:00:00Z");

  it.each([
    ["cancelled", new Date("2026-08-01T11:00:00Z"), "cancelled"],
    ["planned", new Date("2026-08-01T09:59:59Z"), "planned"],
    ["planned", start, "live"],
    ["planned", end, "live"],
    ["planned", new Date("2026-08-01T12:00:01Z"), "completed"],
  ] as const)("derives %s at %s as %s", (stored, now, expected) => {
    expect(displayedEventLifecycle(stored, start, end, now)).toBe(expected);
  });

  it.each([
    [null, end],
    [new Date(Number.NaN), end],
    [end, start],
  ])("keeps invalid times planned", (invalidStart, invalidEnd) => {
    expect(
      displayedEventLifecycle("planned", invalidStart, invalidEnd, start),
    ).toBe("planned");
  });
});
