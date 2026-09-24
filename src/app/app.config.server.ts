import { provideServerRendering, withRoutes } from "@angular/ssr";
import {
  mergeApplicationConfig,
  ApplicationConfig,
  LOCALE_ID,
} from "@angular/core";
import { appConfig } from "./app.config";
import { provideFirebaseAppHostingClient } from "./services/firebase/firebase-app-hosting.providers";
import { serverRoutes } from "./app.routes.server";

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideFirebaseAppHostingClient(),
    { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
