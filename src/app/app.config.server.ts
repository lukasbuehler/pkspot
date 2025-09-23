import { provideServerRendering } from "@angular/ssr";
import {
  mergeApplicationConfig,
  ApplicationConfig,
  LOCALE_ID,
} from "@angular/core";
import { appConfig } from "./app.config";
import { Storage } from "@angular/fire/storage";

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
    // Prevent Firebase Storage initialization on the server (SSR)
    { provide: Storage, useValue: null },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
