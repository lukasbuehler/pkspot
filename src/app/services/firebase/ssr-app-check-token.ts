import type { AppCheckToken } from "firebase/app-check";

const DEFAULT_REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface SsrAppCheckTokenConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  debugToken: string;
}

interface ExchangeResponse {
  token?: unknown;
  ttl?: unknown;
}

/**
 * Exchanges a revocable server credential for ordinary short-lived App Check
 * tokens. The exchange is deliberately independent of Angular and the hosting
 * platform so Node and Worker adapters can supply the same configuration.
 */
export class SsrAppCheckTokenExchange {
  private cachedToken: AppCheckToken | null = null;
  private pendingExchange: Promise<AppCheckToken> | null = null;

  constructor(
    private readonly config: SsrAppCheckTokenConfig,
    private readonly fetcher: typeof fetch = globalThis.fetch,
    private readonly now: () => number = Date.now,
    private readonly refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
  ) {}

  getToken(): Promise<AppCheckToken> {
    if (this.isFresh(this.cachedToken)) {
      return Promise.resolve(this.cachedToken);
    }

    if (!this.pendingExchange) {
      this.pendingExchange = this.exchange().finally(() => {
        this.pendingExchange = null;
      });
    }

    return this.pendingExchange;
  }

  private isFresh(token: AppCheckToken | null): token is AppCheckToken {
    return (
      token !== null &&
      token.expireTimeMillis - this.now() > this.refreshSkewMs
    );
  }

  private async exchange(): Promise<AppCheckToken> {
    const response = await this.fetcher(this.exchangeUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ debugToken: this.config.debugToken }),
    });

    if (!response.ok) {
      throw new Error(
        `SSR App Check token exchange failed with HTTP ${response.status}`,
      );
    }

    const body = (await response.json()) as ExchangeResponse;
    if (typeof body.token !== "string" || typeof body.ttl !== "string") {
      throw new Error(
        "SSR App Check token exchange returned an invalid response",
      );
    }

    const ttlMs = parseDurationMillis(body.ttl);
    const token = {
      token: body.token,
      expireTimeMillis: this.now() + ttlMs,
    } satisfies AppCheckToken;
    this.cachedToken = token;
    return token;
  }

  private exchangeUrl(): string {
    const { projectId, appId, apiKey } = this.config;
    assertResourcePart(projectId, "project ID");
    assertResourcePart(appId, "app ID");

    const url = new URL(
      `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appId}:exchangeDebugToken`,
    );
    url.searchParams.set("key", apiKey);
    return url.toString();
  }
}

function parseDurationMillis(value: string): number {
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("SSR App Check token exchange returned an invalid TTL");
  }
  return seconds * 1000;
}

function assertResourcePart(value: string, label: string): void {
  if (!/^[A-Za-z0-9:_-]+$/.test(value)) {
    throw new Error(`SSR App Check ${label} is invalid`);
  }
}
