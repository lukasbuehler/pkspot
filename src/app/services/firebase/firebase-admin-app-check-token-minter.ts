import type { AppCheck } from "firebase-admin/app-check";
import type { AppCheckToken } from "firebase/app-check";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

const ADMIN_APP_NAME = "PKSPOT_SSR_TOKEN_MINTER";

/** App Hosting/Cloud Run adapter backed by ambient Google credentials. */
export class FirebaseAdminAppCheckTokenMinter
  implements SsrAppCheckTokenMinter
{
  constructor(
    private readonly appCheck: Pick<AppCheck, "createToken">,
    private readonly now: () => number = Date.now,
  ) {}

  async mintToken(appId: string): Promise<AppCheckToken> {
    const result = await this.appCheck.createToken(appId);
    return {
      token: result.token,
      expireTimeMillis: this.now() + result.ttlMillis,
    };
  }
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
