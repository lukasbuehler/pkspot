import {
  EnvironmentProviders,
  InjectionToken,
  Provider,
  inject,
  makeEnvironmentProviders,
} from "@angular/core";
import { getApps, initializeApp } from "firebase/app";
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import { getFirebaseConfig } from "./firebase-emulator.config";
import { FIREBASE_APP } from "./firebase-client.providers";
import { CachedSsrAppCheckTokenMinter } from "./ssr-app-check-token";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

const SSR_FIREBASE_APP_NAME = "PKSPOT_SSR";
let appCheckInitializedApp: FirebaseApp | null = null;

interface ServerEnvironment {
  readonly PKSPOT_SSR_FIREBASE_APP_ID?: string;
}

export const SSR_APP_CHECK_TOKEN_MINTER =
  new InjectionToken<SsrAppCheckTokenMinter>("SSR App Check token minter");

export function provideFirebaseServerClient(
  tokenMinterProvider: Provider,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    tokenMinterProvider,
    {
      provide: FIREBASE_APP,
      useFactory: initializeFirebaseServerAppFromEnvironment,
    },
  ]);
}

export function initializeFirebaseServerApp(
  environment: ServerEnvironment = readServerEnvironment(),
  baseConfig: FirebaseOptions = getFirebaseConfig(),
  tokenMinter: SsrAppCheckTokenMinter | null = null,
): FirebaseApp {
  const appId = environment.PKSPOT_SSR_FIREBASE_APP_ID?.trim();
  if (!appId) {
    return existingOrNewApp("[DEFAULT]", baseConfig);
  }
  if (!tokenMinter) {
    throw new Error("SSR App Check requires a hosting token minter");
  }

  const app = existingOrNewApp(SSR_FIREBASE_APP_NAME, {
    ...baseConfig,
    appId,
  });
  if (appCheckInitializedApp !== app) {
    console.info("[SSR AppCheck] Initializing verified Firebase client.", {
      appId,
      projectId: baseConfig.projectId,
    });
    const cachedTokenMinter = new CachedSsrAppCheckTokenMinter(tokenMinter);
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => cachedTokenMinter.mintToken(appId),
      }),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitializedApp = app;
  }

  return app;
}

function initializeFirebaseServerAppFromEnvironment(): FirebaseApp {
  const environment = readServerEnvironment();
  const appId = environment.PKSPOT_SSR_FIREBASE_APP_ID?.trim();
  return initializeFirebaseServerApp(
    environment,
    getFirebaseConfig(),
    appId ? inject(SSR_APP_CHECK_TOKEN_MINTER) : null,
  );
}

function existingOrNewApp(name: string, options: FirebaseOptions): FirebaseApp {
  const existing = getApps().find((app) => app.name === name);
  if (existing) return existing;
  return name === "[DEFAULT]"
    ? initializeApp(options)
    : initializeApp(options, name);
}

function readServerEnvironment(): ServerEnvironment {
  if (typeof process === "undefined") return {};
  return process.env;
}
