import type { Environment, Storage } from "./runtime";

type Bucket = { minute: number; calls: number; dailyCalls: number; records: number };
// Anonymous AI providers share egress IPs. These are network budgets, not users.
// Global limits cap distributed extraction; session/client metadata cannot reset them.
export const LIMITS = {
  network: { minute: 60, daily: 500, records: 2000 },
  global: { minute: 300, daily: 10000, records: 30000 },
} as const;

export class QuotaStore {
  constructor(private readonly state: { storage: Storage }) {}

  async fetch(request: Request): Promise<Response> {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object") return new Response(null, { status: 400 });
    const { principal, records, countCall = true } = input as Record<string, unknown>;
    if (typeof principal !== "string" || !/^[a-f0-9]{64}$/.test(principal) ||
        typeof records !== "number" || !Number.isInteger(records) || records < 0 || records > 10 || typeof countCall !== "boolean") {
      return new Response(null, { status: 400 });
    }
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const decision = await this.state.storage.transaction(async (storage) => {
      const keys = ["global", `network:${principal}`];
      const buckets = await Promise.all(keys.map(async (key) => {
        const previous = await storage.get<Bucket>(key);
        return { minute, calls: previous?.minute === minute ? previous.calls : 0,
          dailyCalls: previous?.dailyCalls ?? 0, records: previous?.records ?? 0 };
      }));
      for (const [index, bucket] of buckets.entries()) {
        const limit = index === 0 ? LIMITS.global : LIMITS.network;
        if (bucket.dailyCalls + Number(countCall) > limit.daily || bucket.records + records > limit.records) {
          return { allowed: false, retryAfter: Math.ceil((86400000 - now % 86400000) / 1000) };
        }
        if (bucket.calls + Number(countCall) > limit.minute) {
          return { allowed: false, retryAfter: Math.ceil((60000 - now % 60000) / 1000) };
        }
      }
      await Promise.all(keys.map((key, index) => {
        const bucket = buckets[index]!;
        return storage.put(key, { minute, calls: bucket.calls + Number(countCall),
          dailyCalls: bucket.dailyCalls + Number(countCall), records: bucket.records + records });
      }));
      return { allowed: true, retryAfter: 0 };
    });
    await this.state.storage.setAlarm(now - now % 86400000 + 2 * 86400000);
    return Response.json(decision);
  }

  async alarm(): Promise<void> { await this.state.storage.deleteAll(); }
}

export async function reserve(env: Environment, ip: string, records: number, countCall = true): Promise<Response | null> {
  const day = Math.floor(Date.now() / 86400000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.QUOTA_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${day}:${ip}`));
  const principal = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
  const stub = env.QUOTAS.get(env.QUOTAS.idFromName(`day:${day}`));
  const result = await stub.fetch(new Request("https://quota/reserve", {
    method: "POST", body: JSON.stringify({ principal, records, countCall }),
  }));
  if (!result.ok) throw new Error("quota unavailable");
  const decision = await result.json() as { allowed: boolean; retryAfter: number };
  if (decision.allowed) return null;
  return Response.json({ error: "Rate limit reached. Retry later; bulk extraction is not supported." },
    { status: 429, headers: { "Retry-After": String(decision.retryAfter) } });
}
