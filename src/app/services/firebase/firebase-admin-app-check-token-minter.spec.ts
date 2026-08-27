import { describe, expect, it, vi } from "vitest";
import { FirebaseAdminAppCheckTokenMinter } from "./firebase-admin-app-check-token-minter";

describe("FirebaseAdminAppCheckTokenMinter", () => {
  it("converts the Admin SDK TTL into the web provider expiry", async () => {
    const createToken = vi.fn(async () => ({
      token: "signed-app-check-token",
      ttlMillis: 3_600_000,
    }));
    const logger = { info: vi.fn(), error: vi.fn() };
    const minter = new FirebaseAdminAppCheckTokenMinter(
      { createToken },
      () => 1_000,
      logger,
    );

    await expect(minter.mintToken("1:123:web:ssr")).resolves.toEqual({
      token: "signed-app-check-token",
      expireTimeMillis: 3_601_000,
    });
    expect(createToken).toHaveBeenCalledWith("1:123:web:ssr");
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      "[SSR AppCheck] Minting token.",
      { appId: "1:123:web:ssr" },
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "[SSR AppCheck] Token minted.",
      {
        appId: "1:123:web:ssr",
        durationMs: 0,
        ttlMillis: 3_600_000,
      },
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs sanitized diagnostics and rethrows minting failures", async () => {
    const error = Object.assign(
      new Error(
        "Denied for admin@example.com; see https://example.com/help?token=secret with AIzaExampleKey",
      ),
      { code: "app/invalid-credential" },
    );
    const logger = { info: vi.fn(), error: vi.fn() };
    const minter = new FirebaseAdminAppCheckTokenMinter(
      { createToken: vi.fn(async () => Promise.reject(error)) },
      () => 1_000,
      logger,
    );

    await expect(minter.mintToken("1:123:web:ssr")).rejects.toBe(error);
    expect(logger.error).toHaveBeenCalledWith(
      "[SSR AppCheck] Token mint failed.",
      {
        appId: "1:123:web:ssr",
        durationMs: 0,
        errorName: "Error",
        errorCode: "app/invalid-credential",
        errorMessage:
          "Denied for [email]; see [url] with [api-key]",
      },
    );
  });
});
