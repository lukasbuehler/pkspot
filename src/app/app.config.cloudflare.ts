import { ApplicationConfig, LOCALE_ID } from "@angular/core";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import { appConfig } from "./app.config";
import { serverRoutes } from "./app.routes.server";
import { provideFirebaseCloudflareClient } from "./services/firebase/firebase-cloudflare.providers";

export const config: ApplicationConfig = {
  ...appConfig,
  providers: [
    ...(appConfig.providers ?? []),
    provideServerRendering(withRoutes(serverRoutes)),
    provideFirebaseCloudflareClient(),
    { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
  ],
};
