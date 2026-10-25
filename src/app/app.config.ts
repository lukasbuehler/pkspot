import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
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
  withNoIncrementalHydration,
} from "@angular/platform-browser";
import { MAT_DIALOG_DEFAULT_OPTIONS } from "@angular/material/dialog";
import { MAT_MENU_SCROLL_STRATEGY } from "@angular/material/menu";
import { Overlay } from "@angular/cdk/overlay";
import { provideNativeDateAdapter } from "@angular/material/core";

import { routes } from "./app.routes";
import { provideRouter, withInMemoryScrolling } from "@angular/router";
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
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: "enabled",
        scrollPositionRestoration: "enabled",
      }),
    ),
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
    // The app has no `@defer (... hydrate ...)` blocks. Disabling incremental
    // hydration also keeps its browser-only event replay initializer out of
    // Vite's dev SSR runtime, where it would otherwise access `window`.
    provideClientHydration(withI18nSupport(), withNoIncrementalHydration()),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideAnimations(),
    { provide: ErrorHandler, useClass: ApplicationErrorHandler },
    provideBrowserGlobalErrorListeners(),
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
