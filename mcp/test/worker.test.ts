import { afterEach, describe, expect, it, vi } from "vitest";
import { handle } from "../src/worker";
import { QuotaStore, LIMITS } from "../src/quota";
import type { Environment, Storage } from "../src/runtime";

function memoryStorage(): Storage {
  const map = new Map<string, unknown>();
  let queue = Promise.resolve();
  const storage: Storage = {
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async (key, value) => { map.set(key, value); },
    transaction: async <T>(callback: (storage: Storage) => Promise<T>) => {
      const result = queue.then(() => callback(storage));
      queue = result.then(() => {}, () => {});
      return result;
    },
    setAlarm: vi.fn(async () => {}), deleteAll: async () => { map.clear(); },
  };
  return storage;
}
function environment(): Environment {
  const store = new QuotaStore({ storage: memoryStorage() });
  return { PUBLIC_ORIGIN: "https://mcp.pkspot.app", TYPESENSE_ORIGIN: "https://search.example",
    TYPESENSE_SEARCH_KEY: "test", FIRESTORE_PROJECT_ID: "test-project", QUOTA_SECRET: "x".repeat(32),
    QUOTAS: { idFromName: (name) => name, get: () => store } };
}
const context = { waitUntil: (promise: Promise<unknown>) => { void promise; } };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://mcp.pkspot.app/mcp", { method: "POST", headers: {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    "CF-Connecting-IP": "192.0.2.1", ...headers,
  }, body: JSON.stringify(body) });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Worker with real MCP SDK transport", () => {
  it("initializes and advertises six portable read-only tools", async () => {
    const env = environment();
    const init = await handle(request({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" },
    } }), env, context);
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("PK Spot");
    const response = await handle(request({ jsonrpc: "2.0", id: 2, method: "tools/list" }), env, context);
    const tools = (await response.json()).result.tools;
    expect(tools).toHaveLength(6);
    expect(tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint)).toBe(true);
  });
  it("calls the real SDK tool handler through HTTP and hides upstream errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("SECRET response")));
    const response = await handle(request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
      name: "search_events", arguments: {},
    } }), environment(), context);
    const body = await response.json();
    expect(body.result.isError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(body.result.structuredContent.error).toBe("unavailable");
  });
  it("returns a real projected search result through the full HTTP path", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ hits: [{ document: { id: "spot1" } }] }))
      .mockResolvedValueOnce(Response.json({ fields: { name: { stringValue: "Training Park" }, access: { stringValue: "public" },
        rating: { doubleValue: 4 }, private_debug: { stringValue: "secret" } } }));
    vi.stubGlobal("fetch", fetcher);
    const response = await handle(request({ jsonrpc: "2.0", id: 3, method: "tools/call", params: {
      name: "search_spots", arguments: { query: "Training Park" },
    } }), environment(), context);
    const body = await response.json();
    expect(body.result.isError, JSON.stringify(body)).not.toBe(true);
    expect(body.result.structuredContent.items[0]).toMatchObject({ name: "Training Park", url: "https://pkspot.app/map/spot1" });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it("rejects batch, excess payload, unsafe origin and unknown filters", async () => {
    const env = environment();
    expect((await handle(request([]), env, context)).status).toBe(400);
    expect((await handle(request({ pad: "x".repeat(17000) }), env, context)).status).toBe(413);
    expect((await handle(request({}, { Origin: "https://evil.test" }), env, context)).status).toBe(403);
    expect((await handle(request({ method: "tools/call", params: { name: "search_spots", arguments: { query: "park", filter_by: "*" } } }), env, context)).status).toBe(400);
  });
  it("fails closed when quota storage fails", async () => {
    const env = environment();
    env.QUOTAS.get = () => ({ fetch: async () => { throw new Error("storage failed"); } });
    expect((await handle(request({ method: "tools/list" }), env, context)).status).toBe(503);
  });
  it("session and client metadata cannot bypass the network quota", async () => {
    const env = environment();
    for (let i = 0; i < LIMITS.network.minute; i++) {
      await handle(request({ jsonrpc: "2.0", id: i, method: "ping", params: { _meta: { "openai/subject": String(i) } } }), env, context);
    }
    const limited = await handle(request({ method: "ping" }, { "Mcp-Session-Id": "fresh" }), env, context);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});

describe("durable quota accounting", () => {
  it("enforces the daily extraction allowance across minute resets", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T00:00:00Z"));
    const store = new QuotaStore({ storage: memoryStorage() });
    const request = () => new Request("https://quota", { method: "POST", body: JSON.stringify({ principal: "c".repeat(64), records: 10, countCall: false }) });
    for (let i = 0; i < 200; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 8, 30, 0, i)));
      expect((await (await store.fetch(request())).json()).allowed).toBe(true);
    }
    const blocked = await (await store.fetch(request())).json();
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(60);
  });
  it("serializes concurrent reservations and retains counters across instances", async () => {
    const storage = memoryStorage();
    const first = new QuotaStore({ storage });
    const call = (store: QuotaStore) => store.fetch(new Request("https://quota", { method: "POST", body: JSON.stringify({ principal: "a".repeat(64), records: 10 }) }));
    const responses = await Promise.all(Array.from({ length: 70 }, () => call(first)));
    const decisions = await Promise.all(responses.map((r) => r.json()));
    expect(decisions.filter((d) => d.allowed)).toHaveLength(60);
    expect((await (await call(new QuotaStore({ storage }))).json()).allowed).toBe(false);
    await first.alarm();
    expect((await (await call(first)).json()).allowed).toBe(true);
  });
  it("enforces a global budget across different network identities", async () => {
    const store = new QuotaStore({ storage: memoryStorage() });
    let denied = 0;
    for (let i = 0; i < 310; i++) {
      const response = await store.fetch(new Request("https://quota", { method: "POST", body: JSON.stringify({ principal: i.toString(16).padStart(64, "0"), records: 10 }) }));
      if (!(await response.json()).allowed) denied++;
    }
    expect(denied).toBe(10);
  });
});
