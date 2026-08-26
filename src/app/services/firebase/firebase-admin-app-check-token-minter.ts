import type { AppCheck } from "firebase-admin/app-check";
import type { AppCheckToken } from "firebase/app-check";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

const ADMIN_APP_NAME = "PKSPOT_SSR_TOKEN_MINTER";
const MAX_ERROR_MESSAGE_LENGTH = 500;

type SsrAppCheckLogger = Pick<Console, "error" | "info">;

/** App Hosting/Cloud Run adapter backed by ambient Google credentials. */
export class FirebaseAdminAppCheckTokenMinter
  implements SsrAppCheckTokenMinter
{
  constructor(
    private readonly appCheck: Pick<AppCheck, "createToken">,
    private readonly now: () => number = Date.now,
    private readonly logger: SsrAppCheckLogger = console,
  ) {}

  async mintToken(appId: string): Promise<AppCheckToken> {
    const startedAt = this.now();
    this.logger.info("[SSR AppCheck] Minting token.", { appId });

    try {
      const result = await this.appCheck.createToken(appId);
      const completedAt = this.now();
      this.logger.info("[SSR AppCheck] Token minted.", {
        appId,
        durationMs: completedAt - startedAt,
        ttlMillis: result.ttlMillis,
      });
      return {
        token: result.token,
        expireTimeMillis: completedAt + result.ttlMillis,
      };
    } catch (error) {
      this.logger.error("[SSR AppCheck] Token mint failed.", {
        appId,
        durationMs: this.now() - startedAt,
        ...summarizeError(error),
      });
      throw error;
    }
  }
}

function summarizeError(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) {
    return { errorType: typeof error };
  }

  const code = getStringProperty(error, "code");
  return {
    errorName: error.name,
    ...(code ? { errorCode: code } : {}),
    errorMessage: sanitizeErrorMessage(error.message),
  };
}

function getStringProperty(value: object, key: string): string | null {
  const property = (value as Record<string, unknown>)[key];
  return typeof property === "string" ? property : null;
}

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/giu, "[url]")
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, "[email]")
    .replace(/AIza[\w-]+/gu, "[api-key]")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/gu, "[token]")
    .slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

export function createFirebaseAdminAppCheckTokenMinter(
  projectId: string,
): SsrAppCheckTokenMinter {
  let appCheckPromise: Promise<AppCheck> | null = null;
  return new FirebaseAdminAppCheckTokenMinter({
    createToken: async (appId, options) => {
      appCheckPromise ??= loadAdminAppCheck(projectId);
      return (await appCheckPromise).createToken(appId, options);
    },
  });
}

async function loadAdminAppCheck(projectId: string): Promise<AppCheck> {
  const [adminAppModule, adminAppCheckModule] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/app-check"),
  ]);
  const adminApp =
    adminAppModule.getApps().find(({ name }) => name === ADMIN_APP_NAME) ??
    adminAppModule.initializeApp(
      {
        credential: adminAppModule.applicationDefault(),
        projectId,
      },
      ADMIN_APP_NAME,
    );
  return adminAppCheckModule.getAppCheck(adminApp);
}
