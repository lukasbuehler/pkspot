import {
  ApplicationConfig,
  importProvidersFrom,
  LOCALE_ID,
  DOCUMENT,
  PLATFORM_ID,
  inject,
} from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { environment } from "../environments/environment";
import {
  provideFunctions,
  getFunctions as ngfGetFunctions,
} from "@angular/fire/functions";
import { GoogleMapsModule } from "@angular/google-maps";

import { provideAnimations } from "@angular/platform-browser/animations";
import {
  provideStorage,
  Storage,
  getStorage as ngfGetStorage,
} from "@angular/fire/storage";
import {
  provideFirestore,
  getFirestore as ngfGetFirestore,
  connectFirestoreEmulator,
  setLogLevel,
  initializeFirestore,
  memoryLocalCache,
} from "@angular/fire/firestore";
import {
  provideFirebaseApp,
  initializeApp,
  FirebaseApp,
} from "@angular/fire/app";
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
import { provideNativeDateAdapter } from "@angular/material/core";

import { routes } from "./app.routes";
import { provideRouter, withViewTransitions } from "@angular/router";
import { WINDOW, windowProvider } from "./providers/window";

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp(environment.keys.firebaseConfig)),
    // Bind Firestore/Storage/Functions to the injected FirebaseApp to enforce init ordering
    // Bind Firestore/Storage/Functions to the injected FirebaseApp to enforce init ordering
    provideFirestore(() => {
      const app = inject(FirebaseApp);
      if (environment.production === false) {
        setLogLevel("debug"); // Enable concise debug logs to diagnose connection issues
      }
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
        localCache: memoryLocalCache(), // Disable IndexedDB persistence for Capacitor stability
      });
    }),
    // Only initialize Storage on the browser; use AngularFire's getStorage to avoid registration issues
    provideStorage(() => {
      const platformId = inject(PLATFORM_ID);
      if (!isPlatformBrowser(platformId)) {
        return null as unknown as Storage;
      }
      // Prefer AngularFire's getStorage which is aware of Angular zones/injection context
      return ngfGetStorage(inject(FirebaseApp));
    }),
    provideFunctions(() => ngfGetFunctions(inject(FirebaseApp))),
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
    provideNativeDateAdapter(),
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
