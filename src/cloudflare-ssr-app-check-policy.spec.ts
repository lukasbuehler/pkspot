import { describe, expect, it } from "vitest";
import { isAuthorizedCloudflareSsrTokenRequest } from "../functions/src/cloudflareSsrAppCheckPolicy";

describe("Cloudflare SSR App Check broker policy", () => {
  it("accepts the configured app and exact bearer secret", () => {
    expect(
      isAuthorizedCloudflareSsrTokenRequest(
        "Bearer worker-secret",
        "worker-secret",
        "1:123:web:cloudflare-ssr",
        "1:123:web:cloudflare-ssr",
      ),
    ).toBe(true);
  });

  it.each([
    [undefined, "1:123:web:cloudflare-ssr"],
    ["Bearer wrong-secret", "1:123:web:cloudflare-ssr"],
    ["Basic worker-secret", "1:123:web:cloudflare-ssr"],
    ["Bearer worker-secret", "1:123:web:another-app"],
  ])("rejects unauthorized credentials or app IDs", (authorization, appId) => {
    expect(
      isAuthorizedCloudflareSsrTokenRequest(
        authorization,
        "worker-secret",
        appId,
        "1:123:web:cloudflare-ssr",
      ),
    ).toBe(false);
  });
});
