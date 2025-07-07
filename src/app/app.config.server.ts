import { provideServerRendering } from '@angular/ssr';
import {
  mergeApplicationConfig,
  ApplicationConfig,
  LOCALE_ID,
} from "@angular/core";
import { appConfig } from "./app.config";

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
