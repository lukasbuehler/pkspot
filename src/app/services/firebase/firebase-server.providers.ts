import { EnvironmentProviders, makeEnvironmentProviders } from "@angular/core";
import { getApps, initializeApp } from "firebase/app";
import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { CustomProvider, initializeAppCheck } from "firebase/app-check";
import { getFirebaseConfig } from "./firebase-emulator.config";
import { FIREBASE_APP } from "./firebase-client.providers";
import { SsrAppCheckTokenExchange } from "./ssr-app-check-token";
import type { SsrAppCheckTokenConfig } from "./ssr-app-check-token";

const SSR_FIREBASE_APP_NAME = "PKSPOT_SSR";
let appCheckInitializedApp: FirebaseApp | null = null;

interface ServerEnvironment {
  readonly PKSPOT_SSR_FIREBASE_APP_ID?: string;
  readonly PKSPOT_SSR_APP_CHECK_DEBUG_TOKEN?: string;
}

export function provideFirebaseServerClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: initializeFirebaseServerApp,
    },
  ]);
}

export function initializeFirebaseServerApp(
  environment: ServerEnvironment = readServerEnvironment(),
  baseConfig: FirebaseOptions = getFirebaseConfig(),
): FirebaseApp {
  const tokenConfig = readTokenConfig(environment, baseConfig);
  if (!tokenConfig) {
    return existingOrNewApp("[DEFAULT]", baseConfig);
  }

  const app = existingOrNewApp(SSR_FIREBASE_APP_NAME, {
    ...baseConfig,
    appId: tokenConfig.appId,
  });
  if (appCheckInitializedApp !== app) {
    const tokenExchange = new SsrAppCheckTokenExchange(tokenConfig);
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => tokenExchange.getToken(),
      }),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitializedApp = app;
  }

  return app;
}

function readTokenConfig(
  environment: ServerEnvironment,
  baseConfig: FirebaseOptions,
): SsrAppCheckTokenConfig | null {
  const appId = environment.PKSPOT_SSR_FIREBASE_APP_ID?.trim();
  const debugToken = environment.PKSPOT_SSR_APP_CHECK_DEBUG_TOKEN?.trim();
  const projectId = baseConfig.projectId?.trim();
  const apiKey = baseConfig.apiKey?.trim();

  if (!appId && !debugToken) {
    return null;
  }
  if (!appId || !debugToken) {
    throw new Error(
      "SSR App Check requires both the Firebase app ID and debug token",
    );
  }
  if (!projectId || !apiKey) {
    throw new Error(
      "SSR App Check requires projectId and apiKey in the Firebase configuration",
    );
  }

  return { appId, debugToken, projectId, apiKey };
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
