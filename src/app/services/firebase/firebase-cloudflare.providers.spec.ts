import { describe, expect, it, vi } from "vitest";
import { createFirebaseCloudflareAppCheckTokenMinter } from "./firebase-cloudflare.providers";

describe("createFirebaseCloudflareAppCheckTokenMinter", () => {
  it("creates a broker-backed minter from Worker bindings", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ token: "token", expireTimeMillis: 3_600_000 }),
    );
    const minter = createFirebaseCloudflareAppCheckTokenMinter(
      {
        PKSPOT_SSR_APP_CHECK_BROKER_URL:
          "https://broker.example.test/token",
        PKSPOT_SSR_APP_CHECK_BROKER_SECRET: "secret",
      },
      fetcher,
    );

    await expect(minter.mintToken("1:123:web:ssr")).resolves.toEqual({
      token: "token",
      expireTimeMillis: 3_600_000,
    });
  });

  it("fails closed when a binding is missing", () => {
    expect(() => createFirebaseCloudflareAppCheckTokenMinter({})).toThrow(
      "broker bindings are incomplete",
    );
  });

  it("requires an encrypted broker connection", () => {
    expect(() =>
      createFirebaseCloudflareAppCheckTokenMinter({
        PKSPOT_SSR_APP_CHECK_BROKER_URL: "http://broker.example.test/token",
        PKSPOT_SSR_APP_CHECK_BROKER_SECRET: "secret",
      }),
    ).toThrow("must use HTTPS");
  });
});
