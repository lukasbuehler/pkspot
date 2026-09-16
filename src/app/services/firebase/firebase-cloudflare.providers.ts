import { EnvironmentProviders } from "@angular/core";
import { FirebaseAppCheckTokenBrokerMinter } from "./firebase-app-check-token-broker";
import {
  SSR_APP_CHECK_TOKEN_MINTER,
  provideFirebaseServerClient,
} from "./firebase-server.providers";
import type { SsrAppCheckTokenMinter } from "./ssr-app-check-token";

interface CloudflareSsrEnvironment {
  readonly PKSPOT_SSR_APP_CHECK_BROKER_SECRET?: string;
  readonly PKSPOT_SSR_APP_CHECK_BROKER_URL?: string;
}

export function provideFirebaseCloudflareClient(): EnvironmentProviders {
  return provideFirebaseServerClient({
    provide: SSR_APP_CHECK_TOKEN_MINTER,
    useFactory: createFirebaseCloudflareAppCheckTokenMinter,
  });
}

export function createFirebaseCloudflareAppCheckTokenMinter(
  environment: CloudflareSsrEnvironment = process.env,
  fetcher: typeof fetch = fetch,
): SsrAppCheckTokenMinter {
  const brokerUrl = environment.PKSPOT_SSR_APP_CHECK_BROKER_URL?.trim();
  const brokerSecret =
    environment.PKSPOT_SSR_APP_CHECK_BROKER_SECRET?.trim();
  if (!brokerUrl || !brokerSecret) {
    throw new Error("Cloudflare SSR App Check broker bindings are incomplete");
  }
  if (!brokerUrl.startsWith("https://")) {
    throw new Error("Cloudflare SSR App Check broker URL must use HTTPS");
  }
  return new FirebaseAppCheckTokenBrokerMinter(
    brokerUrl,
    brokerSecret,
    fetcher,
  );
}
