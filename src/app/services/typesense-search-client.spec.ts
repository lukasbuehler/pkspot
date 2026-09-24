import { afterEach, describe, expect, it, vi } from "vitest";
import { TypesenseSearchClient } from "./typesense-search-client";

describe("TypesenseSearchClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("performs collection searches with the search-only API key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ found: 1, hits: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();
    const abortController = new AbortController();

    await client
      .collections("spots v2")
      .documents()
      .search(
        { q: "basel", per_page: 5, filter_by: undefined },
        { abortSignal: abortController.signal },
      );

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://search.example.test/collections/spots%20v2/documents/search?q=basel&per_page=5",
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: { "X-TYPESENSE-API-KEY": "search-key" },
      signal: abortController.signal,
    });
  });

  it("performs multi-search requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = createClient();

    await client.multiSearch.perform(
      { searches: [{ collection: "spots_v2", q: "*" }] },
      { use_cache: true },
    );

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://search.example.test/multi_search?use_cache=true",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TYPESENSE-API-KEY": "search-key",
      },
      body: JSON.stringify({
        searches: [{ collection: "spots_v2", q: "*" }],
      }),
    });
  });

  it("rejects unsuccessful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(
      createClient().collections("spots_v2").documents().search({ q: "*" }),
    ).rejects.toThrow("Typesense request failed with HTTP 503.");
  });
});

function createClient(): TypesenseSearchClient {
  return new TypesenseSearchClient({
    nodes: [
      {
        host: "search.example.test",
        port: 443,
        protocol: "https",
      },
    ],
    apiKey: "search-key",
  });
}
