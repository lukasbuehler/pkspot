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
export const FIREBASE_USE_FETCH_STREAMS = new InjectionToken<boolean>(
  "Firebase Firestore fetch streams",
  { factory: () => false },
);

const firestoreInstances = new WeakMap<FirebaseApp, Firestore>();
const functionsEmulatorConnections = new WeakSet<Functions>();
const storageEmulatorConnections = new WeakSet<FirebaseStorage>();

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
  const app = inject(FIREBASE_APP);
  const existing = firestoreInstances.get(app);
  if (existing) return existing;
  const useFetchStreams = inject(FIREBASE_USE_FETCH_STREAMS);
  let firestoreInstance: Firestore;

  try {
    firestoreInstance = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      // Supported by the Firebase web SDK but not currently exposed publicly.
      // @ts-expect-error useFetchStreams is required by fetch-only SSR runtimes.
      useFetchStreams,
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
  if (emulator) {
    connectFirestoreEmulator(
      firestoreInstance,
      emulator.firestore.host,
      emulator.firestore.port,
    );
  }

  firestoreInstances.set(app, firestoreInstance);
  return firestoreInstance;
}

function initializeFirebaseFunctions(): Functions {
  const functions = getFunctions(inject(FIREBASE_APP), "europe-west1");
  const emulator = getFirebaseEmulatorSettings();
  if (emulator && !functionsEmulatorConnections.has(functions)) {
    connectFunctionsEmulator(
      functions,
      emulator.functions.host,
      emulator.functions.port,
    );
    functionsEmulatorConnections.add(functions);
  }
  return functions;
}

function initializeFirebaseStorage(): FirebaseStorage | null {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;

  const storage = getStorage(inject(FIREBASE_APP));
  const emulator = getFirebaseEmulatorSettings();
  if (emulator && !storageEmulatorConnections.has(storage)) {
    connectStorageEmulator(storage, emulator.storage.host, emulator.storage.port);
    storageEmulatorConnections.add(storage);
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
