import type { AppCheckToken } from "firebase/app-check";

const DEFAULT_REFRESH_SKEW_MS = 5 * 60 * 1000;

/** Hosting adapters implement this boundary with their trusted runtime identity. */
export interface SsrAppCheckTokenMinter {
  mintToken(appId: string): Promise<AppCheckToken>;
}

/** Shares one short-lived token across concurrent SSR renders. */
export class CachedSsrAppCheckTokenMinter implements SsrAppCheckTokenMinter {
  private cachedToken: AppCheckToken | null = null;
  private pendingToken: Promise<AppCheckToken> | null = null;

  constructor(
    private readonly delegate: SsrAppCheckTokenMinter,
    private readonly now: () => number = Date.now,
    private readonly refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
  ) {}

  mintToken(appId: string): Promise<AppCheckToken> {
    if (this.isFresh(this.cachedToken)) {
      return Promise.resolve(this.cachedToken);
    }

    if (!this.pendingToken) {
      this.pendingToken = this.delegate
        .mintToken(appId)
        .then((token) => {
          validateToken(token, this.now());
          this.cachedToken = token;
          return token;
        })
        .finally(() => {
          this.pendingToken = null;
        });
    }

    return this.pendingToken;
  }

  private isFresh(token: AppCheckToken | null): token is AppCheckToken {
    return (
      token !== null &&
      token.expireTimeMillis - this.now() > this.refreshSkewMs
    );
  }
}

function validateToken(token: AppCheckToken, now: number): void {
  if (!token.token || token.expireTimeMillis <= now) {
    throw new Error("SSR App Check token minter returned an invalid token");
  }
}
