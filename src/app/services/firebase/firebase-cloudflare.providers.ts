import {
  DestroyRef,
  EnvironmentProviders,
  REQUEST_CONTEXT,
  inject,
  makeEnvironmentProviders,
} from "@angular/core";
import { deleteApp } from "firebase/app";
import type { AppCheckToken } from "firebase/app-check";
import type { SsrRequestScope } from "../../../ssr-request-scope";
import { FirebaseAppCheckTokenBrokerMinter } from "./firebase-app-check-token-broker";
import {
  FIREBASE_APP,
  FIREBASE_USE_FETCH_STREAMS,
} from "./firebase-client.providers";
import { getFirebaseConfig } from "./firebase-emulator.config";
import {
  SSR_APP_CHECK_TOKEN_MINTER,
  initializeFirebaseServerApp,
} from "./firebase-server.providers";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

interface CloudflareSsrEnvironment {
  readonly PKSPOT_SSR_FIREBASE_APP_ID?: string;
  readonly PKSPOT_SSR_APP_CHECK_BROKER_SECRET?: string;
  readonly PKSPOT_SSR_APP_CHECK_BROKER_URL?: string;
}

// Only settled token data may cross Worker requests, never pending network work.
const cachedTokens = new Map<string, AppCheckToken>();

export function provideFirebaseCloudflareClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: SSR_APP_CHECK_TOKEN_MINTER,
      useFactory: createFirebaseCloudflareAppCheckTokenMinter,
    },
    { provide: FIREBASE_APP, useFactory: initializeCloudflareFirebaseApp },
    { provide: FIREBASE_USE_FETCH_STREAMS, useValue: true },
  ]);
}

function initializeCloudflareFirebaseApp() {
  const appId = process.env["PKSPOT_SSR_FIREBASE_APP_ID"]?.trim();
  const app = initializeFirebaseServerApp(
    process.env,
    getFirebaseConfig(),
    appId ? inject(SSR_APP_CHECK_TOKEN_MINTER) : null,
    { name: `PKSPOT_SSR_${crypto.randomUUID()}`, autoRefresh: false },
  );
  const scope = inject(REQUEST_CONTEXT) as SsrRequestScope | null;
  const destroyRef = inject(DestroyRef);
  if (scope) {
    // Angular returns a streaming Response before destroying the application.
    // Let its listeners unsubscribe before terminating their Firestore client.
    const destroyed = new Promise<void>((resolve) =>
      destroyRef.onDestroy(resolve),
    );
    scope.onClose(async () => {
      await destroyed;
      await deleteApp(app);
    });
  } else {
    // Angular also bootstraps outside a request while extracting server routes.
    destroyRef.onDestroy(() => {
      void deleteApp(app).catch((error: unknown) =>
        console.error("SSR cleanup failed", error),
      );
    });
  }
  return app;
}

export function createFirebaseCloudflareAppCheckTokenMinter(
  environment: CloudflareSsrEnvironment = process.env,
  fetcher: typeof fetch = fetch,
): SsrAppCheckTokenMinter {
  const brokerUrl = environment.PKSPOT_SSR_APP_CHECK_BROKER_URL?.trim();
  const brokerSecret = environment.PKSPOT_SSR_APP_CHECK_BROKER_SECRET?.trim();
  if (!brokerUrl || !brokerSecret) {
    throw new Error("Cloudflare SSR App Check broker bindings are incomplete");
  }
  if (!brokerUrl.startsWith("https://")) {
    throw new Error("Cloudflare SSR App Check broker URL must use HTTPS");
  }
  const broker = new FirebaseAppCheckTokenBrokerMinter(
    brokerUrl,
    brokerSecret,
    fetcher,
  );
  return {
    async mintToken(appId) {
      const key = `${brokerUrl}:${appId}`;
      const cached = cachedTokens.get(key);
      if (cached && cached.expireTimeMillis > Date.now() + 300_000)
        return cached;
      const token = await broker.mintToken(appId);
      if (!token.token || token.expireTimeMillis <= Date.now()) {
        throw new Error("SSR App Check broker returned an invalid token");
      }
      cachedTokens.set(key, token);
      return token;
    },
  };
}
