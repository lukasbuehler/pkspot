import { describe, it, expect } from "vitest";
import { project } from "../src/data";
import { describeResult } from "../src/presentation";
import { Discovery, schemas } from "../src/discovery";

describe("model presentation and UI projection", () => {
  it("distinguishes false, missing, null and malformed amenities without changing typed values", () => {
    const item = project(
      "spot",
      "x",
      {
        amenities: {
          covered: false,
          lighting: true,
          wc: null,
          indoor: "false",
        },
      },
      "en",
      true,
    );
    expect(item.amenities).toMatchObject({
      covered: false,
      lighting: true,
      wc: null,
      indoor: null,
    });
    expect(JSON.parse(describeResult({ item })).item.amenities).toMatchObject({
      covered: "no",
      lighting: "yes",
      wc: "not specified",
      indoor: "not specified",
      outdoor: "not specified",
    });
    expect(item.amenities).toMatchObject({ covered: false });
  });
  it("keeps longer detail descriptions and marks shortened search descriptions", () => {
    const doc = { description: "A park with walls. ".repeat(90) };
    const detail = project("spot", "x", doc, "en", true),
      search = project("spot", "x", doc, "en", false);
    expect(detail.description).toBe(doc.description);
    expect(detail.description_truncated).toBe(false);
    expect(search.description_truncated).toBe(true);
    expect(String(search.description)).toMatch(/…$/);
  });
  it("does not present synthetic boundaries as event times", () => {
    const item = project(
      "event",
      "x",
      {
        timing: { mode: "date_only", start_date: "2026-10-08" },
        start: "2026-10-08T00:00:00Z",
      },
      "en",
      true,
    );
    const readable = JSON.parse(describeResult({ item })).item;
    expect(readable.start).toBeUndefined();
    expect(readable.timing_note).toContain("not specified");
    expect(item.start).toBeDefined();
  });
  it("rechecks public visibility, deduplicates IDs and rejects arbitrary UI data", async () => {
    const d = new Discovery({
      read: async (_kind, id) =>
        id === "hidden"
          ? { published: false }
          : { published: true, name: "Community", secret: "never" },
      search: async () => [],
    });
    const result = await d.run("display_results", {
      items: [
        { kind: "community", id: "ok" },
        { kind: "community", id: "ok" },
        { kind: "community", id: "hidden" },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("never");
    expect(
      schemas.display_results.safeParse({
        items: [{ kind: "spot", id: "x", name: "invented" }],
      }).success,
    ).toBe(false);
    expect(
      schemas.display_results.safeParse({
        items: Array(11).fill({ kind: "spot", id: "x" }),
      }).success,
    ).toBe(false);
  });
  it("withholds untrusted image origins and invalid coordinates", async () => {
    const d = new Discovery({
      read: async () => ({
        name: "Park",
        thumbnail_medium_url: "https://evil.test/track",
        location_raw: { lat: 91, lng: 0 },
      }),
      search: async () => [],
    });
    const result = await d.run("display_results", {
      items: [{ kind: "spot", id: "x" }],
    });
    expect(result.items).toEqual([
      expect.objectContaining({ image_url: undefined }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/evil|coordinates/);
  });
});
