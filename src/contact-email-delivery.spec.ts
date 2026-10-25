import {beforeEach, afterEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  fetch: vi.fn(),
}));
vi.mock("../functions/node_modules/firebase-functions/lib/params/index.js", () => ({defineSecret: () => ({value: () => "test-key"})}));
vi.mock("../functions/node_modules/firebase-functions/lib/logger/index.js", () => ({error: vi.fn()}));
vi.mock("../functions/node_modules/firebase-functions/lib/v2/providers/firestore.js", () => ({onDocumentCreated: (_options: unknown, handler: unknown) => handler}));
vi.mock("../functions/node_modules/firebase-admin/lib/index.js", () => {
  const doc = (path: string) => ({
    path,
    get: async () => ({data: () => mocks.documents.get(path)}),
    set: async (value: Record<string, unknown>) => {
      mocks.documents.set(path, {...mocks.documents.get(path), ...value});
    },
  });
  const firestore = Object.assign(() => ({doc}), {FieldValue: {serverTimestamp: () => "server-time"}});
  return {firestore};
});
import {onContactMessageEmailCreate} from "../functions/src/contactEmailFunctions";

const deliver = onContactMessageEmailCreate as unknown as (event: {
  params: {messageId: string};
  data: {createTime: {toMillis: () => number}; data: () => Record<string, unknown>};
}) => Promise<void>;
const event = (id: string, ageHours = 0) => ({
  params: {messageId: id},
  data: {
    createTime: {toMillis: () => Date.now() - ageHours * 60 * 60 * 1000},
    data: () => ({contact_info: "visitor@example.org", message: "hello"}),
  },
});
const status = (id: string) => mocks.documents.get(`contact_email_delivery/${id}`);

describe("support email delivery", () => {
  beforeEach(() => {
    mocks.documents.clear();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends once with an idempotency key and skips a delivered retry", async () => {
    mocks.fetch.mockResolvedValue({ok: true, status: 200});
    await deliver(event("a"));
    await deliver(event("a"));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("contact-a");
    expect(status("a")).toMatchObject({status: "sent"});
  });

  it("throws on transient failures so the trigger retries", async () => {
    for (const code of [500, 429, 409]) {
      mocks.fetch.mockResolvedValueOnce({ok: false, status: code});
      await expect(deliver(event(`t${code}`))).rejects.toThrow(`HTTP ${code}`);
    }
  });

  it("marks permanent rejections for review instead of retrying", async () => {
    mocks.fetch.mockResolvedValue({ok: false, status: 422});
    await expect(deliver(event("b"))).resolves.toBeUndefined();
    expect(status("b")).toMatchObject({status: "needs_review", reason: "provider_rejected_422"});
  });

  it("stops retrying at the idempotency window", async () => {
    await deliver(event("c", 24));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(status("c")).toMatchObject({status: "needs_review", reason: "delivery_window_expired"});
  });
});
