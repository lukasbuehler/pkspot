import {
  ApplicationConfig,
  importProvidersFrom,
  LOCALE_ID,
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
} from "@angular/platform-browser";
import { MAT_DIALOG_DEFAULT_OPTIONS } from "@angular/material/dialog";

import { routes } from "./app.routes";
import { provideRouter } from "@angular/router";
import { WINDOW, windowProvider } from "./providers/window";
import { DOCUMENT } from "@angular/common";
import { getAuth, provideAuth } from "@angular/fire/auth";

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp(environment.keys.firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage()),
    provideFunctions(() => getFunctions()),
    provideAuth(() => getAuth()),
    provideRouter(routes),
    BrowserModule,
    GoogleMapsModule,
    {
      provide: MAT_DIALOG_DEFAULT_OPTIONS,
      useValue: {
        hasBackdrop: true,
        position: {
          top: "50px",
        },
      },
    },
    provideClientHydration(withI18nSupport()),
    provideHttpClient(withInterceptorsFromDi(), withFetch()),
    provideAnimations(),
    {
      provide: WINDOW,
      useFactory: (document: Document) => windowProvider(document),
      deps: [DOCUMENT],
    },
    { provide: LOCALE_ID, useValue: $localize.locale ?? "en" },
  ],
};
