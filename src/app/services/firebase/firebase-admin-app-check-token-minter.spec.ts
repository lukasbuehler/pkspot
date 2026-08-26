import { describe, expect, it, vi } from "vitest";
import { FirebaseAdminAppCheckTokenMinter } from "./firebase-admin-app-check-token-minter";

describe("FirebaseAdminAppCheckTokenMinter", () => {
  it("converts the Admin SDK TTL into the web provider expiry", async () => {
    const createToken = vi.fn(async () => ({
      token: "signed-app-check-token",
      ttlMillis: 3_600_000,
    }));
    const minter = new FirebaseAdminAppCheckTokenMinter(
      { createToken },
      () => 1_000,
    );

    await expect(minter.mintToken("1:123:web:ssr")).resolves.toEqual({
      token: "signed-app-check-token",
      expireTimeMillis: 3_601_000,
    });
    expect(createToken).toHaveBeenCalledWith("1:123:web:ssr");
  });
});
