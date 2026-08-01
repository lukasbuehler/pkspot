import { isPlatformBrowser } from "@angular/common";
import {
  EnvironmentProviders,
  InjectionToken,
  PLATFORM_ID,
  inject,
  makeEnvironmentProviders,
} from "@angular/core";
import {
  FirebaseApp,
  getApps,
  initializeApp,
} from "firebase/app";
import {
  Firestore,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import {
  Functions,
  connectFunctionsEmulator,
  getFunctions,
} from "firebase/functions";
import {
  FirebaseStorage,
  connectStorageEmulator,
  getStorage,
} from "firebase/storage";
import { environment } from "../../../environments/environment.default";
import {
  getFirebaseConfig,
  getFirebaseEmulatorSettings,
} from "./firebase-emulator.config";

export const FIREBASE_APP = new InjectionToken<FirebaseApp>("Firebase app");
export const FIREBASE_FIRESTORE = new InjectionToken<Firestore>(
  "Firebase Firestore",
);
export const FIREBASE_FUNCTIONS = new InjectionToken<Functions>(
  "Firebase Functions",
);
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage | null>(
  "Firebase Storage",
);

let firestoreInstance: Firestore | null = null;
let firestoreEmulatorConnected = false;
let functionsEmulatorConnected = false;
let storageEmulatorConnected = false;

export function provideFirebaseClient(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: initializeFirebaseApp,
    },
    {
      provide: FIREBASE_FIRESTORE,
      useFactory: initializeFirebaseFirestore,
    },
    {
      provide: FIREBASE_FUNCTIONS,
      useFactory: initializeFirebaseFunctions,
    },
    {
      provide: FIREBASE_STORAGE,
      useFactory: initializeFirebaseStorage,
    },
  ]);
}

function initializeFirebaseApp(): FirebaseApp {
  return (
    getApps().find((app) => app.name === "[DEFAULT]") ??
    initializeApp(getFirebaseConfig())
  );
}

function initializeFirebaseFirestore(): Firestore {
  if (firestoreInstance) return firestoreInstance;

  const app = inject(FIREBASE_APP);

  try {
    firestoreInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // Supported by the Firebase web SDK but not currently exposed publicly.
      // @ts-expect-error useFetchStreams is an intentionally retained WebView setting.
      useFetchStreams: false,
      localCache: memoryLocalCache(),
    });
  } catch (error) {
    if (
      isFirebaseError(error, "failed-precondition") ||
      errorMessage(error).includes("already been called")
    ) {
      firestoreInstance = getFirestore(app);
    } else {
      throw error;
    }
  }

  const emulator = getFirebaseEmulatorSettings();
  if (emulator && !firestoreEmulatorConnected) {
    connectFirestoreEmulator(
      firestoreInstance,
      emulator.firestore.host,
      emulator.firestore.port,
    );
    firestoreEmulatorConnected = true;
  }

  return firestoreInstance;
}

function initializeFirebaseFunctions(): Functions {
  const functions = getFunctions(inject(FIREBASE_APP), "europe-west1");
  const emulator = getFirebaseEmulatorSettings();
  if (emulator && !functionsEmulatorConnected) {
    connectFunctionsEmulator(
      functions,
      emulator.functions.host,
      emulator.functions.port,
    );
    functionsEmulatorConnected = true;
  }
  return functions;
}

function initializeFirebaseStorage(): FirebaseStorage | null {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;

  const storage = getStorage(inject(FIREBASE_APP));
  const emulator = getFirebaseEmulatorSettings();
  if (emulator && !storageEmulatorConnected) {
    connectStorageEmulator(storage, emulator.storage.host, emulator.storage.port);
    storageEmulatorConnected = true;
  }
  return storage;
}

function isFirebaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
