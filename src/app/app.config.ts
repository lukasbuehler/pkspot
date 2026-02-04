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
  initializeFirestore,
  memoryLocalCache,
  Firestore,
} from "@angular/fire/firestore";
import { LogLevel, setLogLevel } from "@angular/fire";
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
import { MAT_MENU_SCROLL_STRATEGY } from "@angular/material/menu";
import { Overlay } from "@angular/cdk/overlay";
import { provideNativeDateAdapter } from "@angular/material/core";

import { routes } from "./app.routes";
import { provideRouter, withViewTransitions } from "@angular/router";
import { WINDOW, windowProvider } from "./providers/window";
import { Capacitor } from "@capacitor/core";

// Module-level singleton to ensure Firestore is only initialized once
let firestoreInstance: Firestore | null = null;

export const appConfig: ApplicationConfig = {
  providers: [
    provideFirebaseApp(() => initializeApp(environment.keys.firebaseConfig)),
    // Bind Firestore/Storage/Functions to the injected FirebaseApp to enforce init ordering
    provideFirestore(() => {
      // Return cached instance if already initialized
      if (firestoreInstance) {
        console.log("[Firestore] Returning cached instance");
        return firestoreInstance;
      }

      const app = inject(FirebaseApp);

      if (environment.production === false) {
        setLogLevel(LogLevel.VERBOSE);
      }

      // Firestore settings optimized for Capacitor/WKWebView
      const firestoreSettings = {
        experimentalForceLongPolling: true, // Required for WKWebView - WebSockets are unreliable
        // @ts-ignore - useFetchStreams is a valid but undocumented option
        useFetchStreams: false, // Disable fetch streams which can hang in WebViews
        localCache: memoryLocalCache(), // Disable IndexedDB persistence for Capacitor stability
      };

      console.log(
        "[Firestore] Initializing with settings:",
        JSON.stringify(firestoreSettings)
      );

      // Try to get existing Firestore instance first, initialize only if needed
      try {
        // Try to initialize with our settings
        firestoreInstance = initializeFirestore(app, firestoreSettings);
        console.log("[Firestore] Successfully initialized new instance");
      } catch (e: any) {
        // If already initialized, just get the existing instance
        if (
          e?.code === "failed-precondition" ||
          e?.message?.includes("already been called")
        ) {
          console.warn(
            "[Firestore] Already initialized, using existing instance"
          );
          firestoreInstance = ngfGetFirestore(app);
        } else {
          throw e;
        }
      }

      return firestoreInstance;
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
    provideRouter(
      routes,
      withViewTransitions({
        onViewTransitionCreated: (transitionInfo) => {
          // Skip transitions on iOS (native or Safari) where View Transitions API
          // causes glitches and backdrop-filter blur flickering
          const platform = Capacitor.getPlatform();

          // Always skip on native iOS
          if (platform === "ios") {
            transitionInfo.transition.skipTransition();
            return;
          }

          // Also skip on Safari desktop (non-native)
          if (platform === "web") {
            const userAgent = navigator?.userAgent ?? "";
            const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
            if (isSafari) {
              transitionInfo.transition.skipTransition();
            }
          }
        },
      })
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
