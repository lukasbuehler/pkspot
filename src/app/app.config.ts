import {
  ApplicationConfig,
  ErrorHandler,
  LOCALE_ID,
  DOCUMENT,
  inject,
  provideAppInitializer,
} from "@angular/core";

import { provideAnimations } from "@angular/platform-browser/animations";
import {
  withInterceptorsFromDi,
  provideHttpClient,
  withFetch,
} from "@angular/common/http";
import {
  provideClientHydration,
  BrowserModule,
  withI18nSupport,
  withIncrementalHydration,
} from "@angular/platform-browser";
import { MAT_DIALOG_DEFAULT_OPTIONS } from "@angular/material/dialog";
import { MAT_MENU_SCROLL_STRATEGY } from "@angular/material/menu";
import { Overlay } from "@angular/cdk/overlay";
import { provideNativeDateAdapter } from "@angular/material/core";

import { routes } from "./app.routes";
import { provideRouter } from "@angular/router";
import { WINDOW, windowProvider } from "./providers/window";
import { ApplicationErrorHandler } from "./services/application-error-handler.service";
import { MapPerformanceProfilerService } from "./services/map-performance-profiler.service";
import { DateTimeFormatService } from "./services/date-time-format.service";
import { provideFirebaseClient } from "./services/firebase/firebase-client.providers";

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseClient(),
    provideAppInitializer(() => {
      inject(MapPerformanceProfilerService).ensureInstalled();
    }),
    provideAppInitializer(() => inject(DateTimeFormatService).initialize()),
    provideRouter(routes),
    BrowserModule,
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        hasBackdrop: true,
      },
    },
    {
      provide: MAT_MENU_SCROLL_STRATEGY,
      useFactory: (overlay: Overlay) => () => overlay.scrollStrategies.block(),
      deps: [Overlay],
    },
    provideNativeDateAdapter(),
    provideClientHydration(withI18nSupport(), withIncrementalHydration()),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideAnimations(),
    { provide: ErrorHandler, useClass: ApplicationErrorHandler },
    // provideExperimentalZonelessChangeDetection(),
    {
      provide: WINDOW,
      useFactory: (document: Document) => windowProvider(document),
      deps: [DOCUMENT],
    },
    { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
    // {
    //   provide: IMAGE_LOADER,
    //   useValue: (config: ImageLoaderConfig) => {
    //     return `https://example.com/images?src=${config.src}&width=${config.width}`;
    //   },
    // },
  ],
};
