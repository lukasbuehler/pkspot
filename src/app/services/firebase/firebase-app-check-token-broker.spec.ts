import { describe, expect, it, vi } from "vitest";
import { FirebaseAppCheckTokenBrokerMinter } from "./firebase-app-check-token-broker";

describe("FirebaseAppCheckTokenBrokerMinter", () => {
  it("authenticates and converts a successful broker response", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ token: "app-check-token", expireTimeMillis: 3_600_000 }),
    );
    const minter = new FirebaseAppCheckTokenBrokerMinter(
      "https://broker.example.test/token",
      "worker-secret",
      fetcher,
    );

    await expect(minter.mintToken("1:123:web:ssr")).resolves.toEqual({
      token: "app-check-token",
      expireTimeMillis: 3_600_000,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://broker.example.test/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appId: "1:123:web:ssr" }),
      }),
    );
  });

  it("reports only the status when the broker denies a request", async () => {
    const minter = new FirebaseAppCheckTokenBrokerMinter(
      "https://broker.example.test/token",
      "worker-secret",
      vi.fn(async () => new Response("sensitive detail", { status: 403 })),
    );

    await expect(minter.mintToken("1:123:web:ssr")).rejects.toThrow(
      "token broker returned 403",
    );
  });

  it("rejects malformed successful responses", async () => {
    const minter = new FirebaseAppCheckTokenBrokerMinter(
      "https://broker.example.test/token",
      "worker-secret",
      vi.fn(async () => Response.json({ token: "missing-expiry" })),
    );

    await expect(minter.mintToken("1:123:web:ssr")).rejects.toThrow(
      "invalid response",
    );
  });
});
