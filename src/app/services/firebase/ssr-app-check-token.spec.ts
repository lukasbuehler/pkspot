import { describe, expect, it, vi } from "vitest";
import { CachedSsrAppCheckTokenMinter } from "./ssr-app-check-token";

const appId = "1:294969617102:web:ssr";

describe("CachedSsrAppCheckTokenMinter", () => {
  it("caches fresh tokens and deduplicates concurrent minting", async () => {
    let resolveToken!: (token: {
      token: string;
      expireTimeMillis: number;
    }) => void;
    const delegate = {
      mintToken: vi.fn(
        () =>
          new Promise<{ token: string; expireTimeMillis: number }>((resolve) => {
            resolveToken = resolve;
          }),
      ),
    };
    const minter = new CachedSsrAppCheckTokenMinter(delegate, () => 0);

    const first = minter.mintToken(appId);
    const concurrent = minter.mintToken(appId);
    expect(delegate.mintToken).toHaveBeenCalledOnce();
    expect(delegate.mintToken).toHaveBeenCalledWith(appId);

    resolveToken({ token: "cached", expireTimeMillis: 3_600_000 });
    await expect(Promise.all([first, concurrent])).resolves.toEqual([
      { token: "cached", expireTimeMillis: 3_600_000 },
      { token: "cached", expireTimeMillis: 3_600_000 },
    ]);
    await expect(minter.mintToken(appId)).resolves.toEqual({
      token: "cached",
      expireTimeMillis: 3_600_000,
    });
    expect(delegate.mintToken).toHaveBeenCalledOnce();
  });

  it("refreshes a token before it expires", async () => {
    let now = 0;
    const delegate = {
      mintToken: vi
        .fn()
        .mockResolvedValueOnce({ token: "first", expireTimeMillis: 600_000 })
        .mockResolvedValueOnce({ token: "second", expireTimeMillis: 901_000 }),
    };
    const minter = new CachedSsrAppCheckTokenMinter(delegate, () => now);

    await expect(minter.mintToken(appId)).resolves.toMatchObject({
      token: "first",
    });
    now = 301_000;
    await expect(minter.mintToken(appId)).resolves.toMatchObject({
      token: "second",
    });
    expect(delegate.mintToken).toHaveBeenCalledTimes(2);
  });

  it.each([
    { token: "", expireTimeMillis: 3_600_000 },
    { token: "expired", expireTimeMillis: 0 },
  ])("rejects invalid tokens returned by an adapter", async (token) => {
    const minter = new CachedSsrAppCheckTokenMinter(
      { mintToken: vi.fn(async () => token) },
      () => 1,
    );

    await expect(minter.mintToken(appId)).rejects.toThrow(
      "token minter returned an invalid token",
    );
  });

  it("retries after a minting failure", async () => {
    const delegate = {
      mintToken: vi
        .fn()
        .mockRejectedValueOnce(new Error("IAM unavailable"))
        .mockResolvedValueOnce({ token: "recovered", expireTimeMillis: 3_600_000 }),
    };
    const minter = new CachedSsrAppCheckTokenMinter(delegate, () => 0);

    await expect(minter.mintToken(appId)).rejects.toThrow("IAM unavailable");
    await expect(minter.mintToken(appId)).resolves.toMatchObject({
      token: "recovered",
    });
  });
});
