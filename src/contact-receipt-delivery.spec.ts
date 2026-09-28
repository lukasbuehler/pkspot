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
  type Ref = ReturnType<typeof doc>;
  const transaction = {get: (ref: Ref) => ref.get(), set: (ref: Ref, data: Record<string, unknown>) => ref.set(data)};
  const firestore = Object.assign(() => ({doc, runTransaction: (run: (tx: typeof transaction) => unknown) => run(transaction)}), {
    FieldValue: {serverTimestamp: () => "server-time"},
  });
  return {firestore};
});
import {onContactMessageReceiptCreate} from "../functions/src/contactReceiptFunctions";

const deliver = onContactMessageReceiptCreate as unknown as (event: {
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

describe("sender receipt delivery", () => {
  beforeEach(() => {
    mocks.documents.clear(); mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ok: true});
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("records receipt delivery and skips duplicate event delivery independently of support mail", async () => {
    mocks.documents.set("contact_email_delivery/one", {sent_at: "earlier"});
    await deliver(event("one")); await deliver(event("one"));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.documents.get("contact_receipt_delivery/one")?.status).toBe("sent");
    expect(mocks.fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe("contact-receipt-one");
  });
  it("limits repeated messages to an address without sending another receipt", async () => {
    await deliver(event("one")); await deliver(event("two"));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.documents.get("contact_receipt_delivery/two")?.reason).toBe("recipient_cooldown");
  });
  it("allows a failed delivery to be retried with the same idempotency key", async () => {
    mocks.fetch.mockResolvedValueOnce({ok: false, status: 503});
    await expect(deliver(event("one"))).rejects.toThrow("HTTP 503");
    expect(mocks.documents.get("contact_receipt_delivery/one")?.sent_at).toBeUndefined();
    await deliver(event("one"));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.documents.get("contact_receipt_delivery/one")?.status).toBe("sent");
  });
  it("requires review after the provider idempotency window", async () => {
    await deliver(event("old", 24));
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.documents.get("contact_receipt_delivery/old")?.status).toBe("needs_review");
  });
});
