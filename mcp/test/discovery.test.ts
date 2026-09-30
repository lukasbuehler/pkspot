import { describe, expect, it, vi } from "vitest";
import { Discovery, schemas } from "../src/discovery";
import { isPublic, project, PublicData, type DataSource, type Document } from "../src/data";
import { capture } from "../src/analytics";
import type { Environment } from "../src/runtime";

function source(documents: Record<string, Document | null>, ids = Object.keys(documents)): DataSource {
  return { read: vi.fn(async (_kind, id) => documents[id] ?? null), search: vi.fn(async () => ids) };
}
const spot = { name: { en: { text: "Park" }, de: { text: "Platz" } }, access: "public", rating: 4,
  location_raw: { lat: 47.37, lng: 8.54 }, amenities: { covered: true } };
const event = { published: true, visibility: "public", name: "Jam", start: "2026-10-01T12:00:00Z", end: "2026-10-01T18:00:00Z", community_keys: ["locality:ch:zh:zurich"] };

describe("discovery contracts", () => {
  it("rejects bulk controls, excessive limits, wildcards and filter injection in IDs", () => {
    expect(schemas.search_spots.safeParse({ query: "park", limit: 100 }).success).toBe(false);
    expect(schemas.search_spots.safeParse({ query: "park", page: 2 }).success).toBe(false);
    expect(schemas.search_spots.safeParse({ query: "*" }).success).toBe(false);
    expect(schemas.search_events.safeParse({ community_id: "x`] || published:false" }).success).toBe(false);
  });
  it("keeps phrase searches separate from filter syntax and does not return raw records", async () => {
    const db = source({ a: { ...spot, secret: "never return", public_import_provenance: { source_name: "Source", token: "private" } } });
    const result = await new Discovery(db).run("search_spots", { query: "park || published:false", locale: "de" });
    expect(db.search).toHaveBeenCalledWith("spot", expect.objectContaining({ q: "park || published:false", filter_by: "access:=[public,commercial]" }));
    expect(result.items).toEqual([expect.objectContaining({ name: "Platz", amenities: expect.objectContaining({ lighting: null }) })]);
    expect(JSON.stringify(result)).not.toMatch(/secret|token|private/);
  });
  it("uses a public community center and validates current amenities and access", async () => {
    const db = source({ area: { published: true, bounds_center: { latitude: 47.37, longitude: 8.54 } },
      good: spot, changed: { ...spot, access: "private" }, stale: { ...spot, amenities: { covered: false } } }, ["good", "changed", "stale"]);
    const result = await new Discovery(db).run("search_spots", { community_id: "area", amenity: "covered", sort: "nearest" });
    expect(result.items).toEqual([expect.objectContaining({ id: "good", distance_m: 0 })]);
    expect(db.search).toHaveBeenCalledWith("spot", expect.objectContaining({ sort_by: "location(47.37,8.54):asc" }));
  });
  it("accepts optional coarse location but never requires host-specific metadata", async () => {
    const db = source({ a: spot });
    const discovery = new Discovery(db);
    await expect(discovery.run("search_spots", {})).rejects.toThrow("invalid_area");
    expect((await discovery.run("search_spots", {}, { "openai/userLocation": { latitude: 47.37, longitude: 8.54 } })).items).toHaveLength(1);
    expect((await discovery.run("search_spots", { query: "Park" })).items).toHaveLength(1);
  });
  it("rechecks event visibility and dates against canonical records", async () => {
    const db = source({ good: event, hidden: { ...event, visibility: "unlisted" },
      draft: { ...event, publication_state: "draft" }, old: { ...event, end: "2025-01-01T12:00:00Z" },
      audience: { ...event, discoverability: { audience: "organization_members" } }, removed: null });
    const discovery = new Discovery(db, () => Date.parse("2026-09-30T12:00:00Z"));
    expect((await discovery.run("search_events", {})).items).toEqual([expect.objectContaining({ id: "good" })]);
    expect(await discovery.run("get_event", { id: "hidden" })).toEqual({ item: null });
  });
  it("rejects reversed or oversized date ranges and honors supplied offsets", async () => {
    const db = source({});
    const discovery = new Discovery(db);
    await expect(discovery.run("search_events", { ends_after: "2026-10-01T00:00:00Z", starts_before: "2026-09-01T00:00:00Z" })).rejects.toThrow("invalid_dates");
    await discovery.run("search_events", { ends_after: "2026-10-01T00:00:00+02:00", starts_before: "2026-10-03T00:00:00+02:00" });
    expect(db.search).toHaveBeenCalledWith("event", expect.objectContaining({ filter_by: expect.stringContaining(String(Date.parse("2026-09-30T22:00:00Z") / 1000)) }));
  });
  it("filters hidden cards and signed-in links and cannot override PK Spot URLs", () => {
    const result = project("community", "area", { canonicalPath: "//attacker.test", infoCards: [
      { title: "Hidden", visibility: "hidden", body: "secret" },
      { title: "Public", body: "hello", ctaVisibility: "signed-in", cta: { url: "https://private.test/invite" } },
    ] }, "en", true);
    expect(result.url).toBe("https://pkspot.app/map/communities/area");
    expect(JSON.stringify(result)).not.toMatch(/secret|private.test|attacker/);
    expect(result.knowledge).toHaveLength(1);
    expect(isPublic("community", { published: false })).toBe(false);
  });
  it("preserves outages as failures instead of empty discovery", async () => {
    const db = source({});
    vi.mocked(db.search).mockRejectedValue(new Error("upstream with sensitive body"));
    await expect(new Discovery(db).run("search_events", {})).rejects.toThrow();
  });
});

describe("backend boundary", () => {
  const env = { FIRESTORE_PROJECT_ID: "test-project", TYPESENSE_ORIGIN: "https://search.example", TYPESENSE_SEARCH_KEY: "test-key" } as Environment;
  it("does not invoke native fetch with the data service as its receiver", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ hits: [], fields: {} }));
    });
    try {
      const db = new PublicData(env);
      expect(await db.search("spot", { q: "park" })).toEqual([]);
      expect(await db.read("spot", "public-spot")).toEqual({});
    } finally { vi.unstubAllGlobals(); }
  });
  it("requests only candidate IDs and decodes public Firestore fields", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ hits: [{ document: { id: "ok" } }, { document: { id: "../bad" } }] }))
      .mockResolvedValueOnce(Response.json({ fields: { name: { mapValue: { fields: { en: { stringValue: "Name" } } } },
        rating: { doubleValue: 4.5 }, amenities: { mapValue: { fields: { indoor: { booleanValue: true } } } } } }));
    const db = new PublicData(env, fetcher);
    expect(await db.search("spot", { q: "park" })).toEqual(["ok"]);
    const url = fetcher.mock.calls[0]![0] as URL;
    expect(url.searchParams.get("include_fields")).toBe("id");
    expect(await db.read("spot", "ok")).toEqual({ name: { en: "Name" }, rating: 4.5, amenities: { indoor: true } });
    expect(fetcher.mock.calls[1]![1]).not.toHaveProperty("headers");
  });
  it("fails closed on denied reads and never follows upstream redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
    expect(await new PublicData(env, fetcher).read("event", "hidden")).toBeNull();
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe("manual");
  });
  it("rejects upstream redirects without following them", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { Location: "https://other.example" },
    }));
    const db = new PublicData(env, fetcher);
    await expect(db.read("spot", "public-spot")).rejects.toThrow("unavailable");
    await expect(db.search("spot", { q: "park" })).rejects.toThrow("unavailable");
    for (const call of fetcher.mock.calls) expect(call[1]?.redirect).toBe("manual");
  });
  it("analytics is opt-in, minimal and cannot break search", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const metric = { tool: "search_spots" as const, outcome: "success" as const, result_count: 2, duration_ms: 80 };
    await capture(env, metric, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    await capture({ ...env, POSTHOG_API_KEY: "test" }, metric, fetcher);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.properties).toEqual({ ...metric, surface: "mcp", $process_person_profile: false, $geoip_disable: true });
  });
});
