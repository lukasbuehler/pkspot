import { describe, expect, it, vi } from "vitest";
import { SsrAppCheckTokenExchange } from "./ssr-app-check-token";

const config = {
  projectId: "parkour-base-project",
  appId: "1:294969617102:web:ssr",
  apiKey: "public-api-key",
  debugToken: "server-secret",
};

describe("SsrAppCheckTokenExchange", () => {
  it("exchanges the credential at the documented endpoint", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ token: "signed-app-check-token", ttl: "3600s" }),
    );
    const exchange = new SsrAppCheckTokenExchange(
      config,
      fetcher,
      () => 1_000,
    );

    await expect(exchange.getToken()).resolves.toEqual({
      token: "signed-app-check-token",
      expireTimeMillis: 3_601_000,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://firebaseappcheck.googleapis.com/v1/projects/parkour-base-project/apps/1:294969617102:web:ssr:exchangeDebugToken?key=public-api-key",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ debugToken: "server-secret" }),
      },
    );
  });

  it("caches fresh tokens and deduplicates concurrent exchanges", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const exchange = new SsrAppCheckTokenExchange(config, fetcher, () => 0);

    const first = exchange.getToken();
    const concurrent = exchange.getToken();
    expect(fetcher).toHaveBeenCalledOnce();

    resolveResponse(Response.json({ token: "cached", ttl: "3600s" }));
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      { token: "cached", expireTimeMillis: 3_600_000 },
      { token: "cached", expireTimeMillis: 3_600_000 },
    ]);
    await expect(exchange.getToken()).resolves.toEqual({
      token: "cached",
      expireTimeMillis: 3_600_000,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("refreshes a token before it expires", async () => {
    let now = 0;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: "first", ttl: "600s" }))
      .mockResolvedValueOnce(Response.json({ token: "second", ttl: "600s" }));
    const exchange = new SsrAppCheckTokenExchange(config, fetcher, () => now);

    await expect(exchange.getToken()).resolves.toMatchObject({ token: "first" });
    now = 301_000;
    await expect(exchange.getToken()).resolves.toMatchObject({ token: "second" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports safe failures without including the credential", async () => {
    const exchange = new SsrAppCheckTokenExchange(
      config,
      vi.fn(async () => new Response("server-secret", { status: 403 })),
    );

    const error = await exchange.getToken().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "SSR App Check token exchange failed with HTTP 403",
    );
    expect((error as Error).message).not.toContain(config.debugToken);
  });

  it.each([
    { token: "valid", ttl: "not-a-duration" },
    { token: "valid" },
    { ttl: "3600s" },
  ])("rejects invalid exchange responses", async (body) => {
    const exchange = new SsrAppCheckTokenExchange(
      config,
      vi.fn(async () => Response.json(body)),
    );

    await expect(exchange.getToken()).rejects.toThrow(/invalid (response|TTL)/);
  });
});
