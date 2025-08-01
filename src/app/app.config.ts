import {
  ApplicationConfig,
  importProvidersFrom,
  LOCALE_ID,
  DOCUMENT,
} from "@angular/core";
import { environment } from "../environments/environment";
import { provideFunctions, getFunctions } from "@angular/fire/functions";
import { GoogleMapsModule } from "@angular/google-maps";

import { provideAnimations } from "@angular/platform-browser/animations";
import { provideStorage, getStorage } from "@angular/fire/storage";
import { provideFirestore, getFirestore } from "@angular/fire/firestore";
import { provideFirebaseApp, initializeApp } from "@angular/fire/app";
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

import { routes } from "./app.routes";
import { provideRouter, withViewTransitions } from "@angular/router";
import { WINDOW, windowProvider } from "./providers/window";

import { getAuth, provideAuth } from "@angular/fire/auth";
import { IMAGE_LOADER, ImageLoaderConfig } from "@angular/common";

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp(environment.keys.firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),
    // TODO: Make Auth provider consent-aware
    // provideAuth(() => getAuth()),
    provideRouter(routes, withViewTransitions()),
    BrowserModule,
    GoogleMapsModule,
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        hasBackdrop: true,
      },
    },
    provideClientHydration(withI18nSupport(), withIncrementalHydration()),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideAnimations(),
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
