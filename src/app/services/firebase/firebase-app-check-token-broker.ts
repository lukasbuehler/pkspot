import type { AppCheckToken } from "firebase/app-check";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

interface TokenBrokerResponse {
  readonly token: string;
  readonly expireTimeMillis: number;
}

/** Cloudflare adapter for the narrowly scoped Google-hosted token broker. */
export class FirebaseAppCheckTokenBrokerMinter
  implements SsrAppCheckTokenMinter
{
  constructor(
    private readonly brokerUrl: string,
    private readonly brokerSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async mintToken(appId: string): Promise<AppCheckToken> {
    const response = await this.fetcher(this.brokerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.brokerSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ appId }),
    });

    if (!response.ok) {
      throw new Error(`SSR App Check token broker returned ${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!isTokenBrokerResponse(payload)) {
      throw new Error("SSR App Check token broker returned an invalid response");
    }
    return payload;
  }
}

function isTokenBrokerResponse(value: unknown): value is TokenBrokerResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TokenBrokerResponse>;
  return (
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    typeof candidate.expireTimeMillis === "number" &&
    Number.isFinite(candidate.expireTimeMillis)
  );
}
