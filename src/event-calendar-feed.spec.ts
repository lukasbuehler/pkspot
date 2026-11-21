import {
  handleEventCalendarFeed,
  icsEventFromDocument,
  isEventCalendarFeedPath,
} from "./event-calendar-feed";

const NOW = new Date("2026-11-21T12:00:00Z");
const typesense = { host: "search.example.test", apiKey: "search-only" };

function typesenseResponse(documents: Record<string, unknown>[]): Response {
  return new Response(
    JSON.stringify({ found: documents.length, hits: documents.map((document) => ({ document })) }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const swissJam = {
  id: "event-1",
  name: "Santa Jam",
  slug: "santa-jam",
  venue_string: "Grandstand",
  locality_string: "Luzern",
  start_seconds: Date.parse("2026-12-05T10:00:00Z") / 1000,
  end_seconds: Date.parse("2026-12-05T17:00:00Z") / 1000,
  timing: { mode: "open_end", start_date: "2026-12-05", start_time: "11:00" },
  lifecycle_status: "planned",
};

describe("event calendar feed", () => {
  it("only claims the feed path", () => {
    expect(isEventCalendarFeedPath("/calendar/events.ics")).toBe(true);
    expect(isEventCalendarFeedPath("/en/calendar/events.ics")).toBe(false);
    expect(isEventCalendarFeedPath("/calendar/events.ics/x")).toBe(false);
  });

  it("queries published events for the filters and returns an iCal feed", async () => {
    const fetchMock = vi.fn(async () => typesenseResponse([swissJam]));
    const response = await handleEventCalendarFeed(
      new Request("https://pkspot.app/calendar/events.ics?country=ch&category=jam"),
      { typesense, fetch: fetchMock, now: () => NOW },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("X-WR-CALNAME:PK Spot events · Switzerland");
    expect(body).toContain("UID:event-event-1@pkspot.app");
    expect(body).toContain("URL:https://pkspot.app/events/santa-jam");
    expect(body).toContain("TRANSP:TRANSPARENT");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = new URL(url);
    expect(request.origin).toBe("https://search.example.test");
    expect(request.pathname).toBe("/collections/events_v1/documents/search");
    expect(new Headers(init.headers).get("X-TYPESENSE-API-KEY")).toBe("search-only");
    const filter = request.searchParams.get("filter_by") ?? "";
    expect(filter).toContain("published:=true");
    expect(filter).toContain("(community_keys:=[`country:ch`] || country_code:=[`CH`])");
    expect(filter).toContain("event_categories:=[`jam`]");
    expect(filter).toContain(`end_seconds:>=${NOW.getTime() / 1000 - 60 * 86400}`);
    expect(request.searchParams.get("sort_by")).toBe("start_seconds:asc");
  });

  it("ignores invalid filter values instead of passing them to Typesense", async () => {
    const fetchMock = vi.fn(async () => typesenseResponse([]));
    await handleEventCalendarFeed(
      new Request("https://pkspot.app/calendar/events.ics?country=`x`]||published:=false&series=a%60b"),
      { typesense, fetch: fetchMock, now: () => NOW },
    );
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    const filter = new URL(url).searchParams.get("filter_by") ?? "";
    expect(filter).not.toContain("published:=false");
    expect(filter).not.toContain("series_ids");
    expect(filter).not.toContain("community_keys");
  });

  it("returns a retryable error when search fails", async () => {
    const response = await handleEventCalendarFeed(
      new Request("https://pkspot.app/calendar/events.ics"),
      {
        typesense,
        fetch: vi.fn(async () => new Response("down", { status: 503 })),
        now: () => NOW,
      },
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("maps date-only and cancelled documents and skips incomplete ones", () => {
    expect(
      icsEventFromDocument(
        {
          ...swissJam,
          lifecycle_status: "cancelled",
          timing: { mode: "date_only", start_date: "2026-12-05", end_date: "2026-12-06" },
        },
        "https://test.pkspot.app",
      ),
    ).toMatchObject({
      cancelled: true,
      dateOnly: { startDate: "2026-12-05", endDate: "2026-12-06" },
      url: "https://test.pkspot.app/events/santa-jam",
    });
    expect(icsEventFromDocument({ id: "x", name: "No dates" }, "https://pkspot.app")).toBeNull();
  });
});
