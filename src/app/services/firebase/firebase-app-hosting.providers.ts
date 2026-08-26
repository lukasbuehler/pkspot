import { EnvironmentProviders } from "@angular/core";
import { getFirebaseConfig } from "./firebase-emulator.config";
import { createFirebaseAdminAppCheckTokenMinter } from "./firebase-admin-app-check-token-minter";
import {
  SSR_APP_CHECK_TOKEN_MINTER,
  provideFirebaseServerClient,
} from "./firebase-server.providers";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

export function provideFirebaseAppHostingClient(): EnvironmentProviders {
  return provideFirebaseServerClient({
    provide: SSR_APP_CHECK_TOKEN_MINTER,
    useFactory: initializeAppHostingTokenMinter,
  });
}

function initializeAppHostingTokenMinter(): SsrAppCheckTokenMinter {
  const projectId = getFirebaseConfig().projectId?.trim();
  if (!projectId) {
    throw new Error("SSR App Check requires a Firebase project ID");
  }
  return createFirebaseAdminAppCheckTokenMinter(projectId);
}
