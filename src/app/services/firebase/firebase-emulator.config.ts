import { FirebaseOptions } from "@angular/fire/app";
import { environment } from "../../../environments/environment";

export const FIREBASE_EMULATOR_STORAGE_KEY = "pkspot:e2e:firebaseEmulators";

export interface FirebaseEmulatorSettings {
  enabled: boolean;
  firebaseConfig: FirebaseOptions;
  firestore: {
    host: string;
    port: number;
  };
  auth: {
    url: string;
  };
  functions: {
    host: string;
    port: number;
  };
  storage: {
    host: string;
    port: number;
  };
}

const defaultSettings: FirebaseEmulatorSettings = {
  enabled: true,
  firebaseConfig: {
    apiKey: "demo-api-key",
    authDomain: "demo-pkspot.firebaseapp.com",
    projectId: "demo-pkspot",
    storageBucket: "demo-pkspot.appspot.com",
    appId: "demo-pkspot",
  },
  firestore: {
    host: "127.0.0.1",
    port: 8080,
  },
  auth: {
    url: "http://127.0.0.1:9099",
  },
  functions: {
    host: "127.0.0.1",
    port: 5001,
  },
  storage: {
    host: "127.0.0.1",
    port: 9199,
  },
};

export function getFirebaseEmulatorSettings():
  | FirebaseEmulatorSettings
  | null {
  if (environment.production || !isBrowserRuntime()) {
    return null;
  }

  const raw = readStorageValue();
  if (!raw || raw === "0" || raw === "false") {
    return null;
  }

  if (raw === "1" || raw === "true") {
    return defaultSettings;
  }

  try {
    return mergeSettings(JSON.parse(raw) as PartialFirebaseEmulatorSettings);
  } catch (error) {
    console.warn(
      "Ignoring invalid Firebase emulator E2E configuration:",
      error,
    );
    return null;
  }
}

export function getFirebaseConfig(): FirebaseOptions {
  return (
    getFirebaseEmulatorSettings()?.firebaseConfig ??
    environment.keys.firebaseConfig
  );
}

function isBrowserRuntime(): boolean {
  return typeof globalThis.window !== "undefined";
}

function readStorageValue(): string | null {
  try {
    return globalThis.window.localStorage.getItem(FIREBASE_EMULATOR_STORAGE_KEY);
  } catch {
    return null;
  }
}

interface PartialFirebaseEmulatorSettings {
  firebaseConfig?: FirebaseOptions;
  firestore?: Partial<FirebaseEmulatorSettings["firestore"]>;
  auth?: Partial<FirebaseEmulatorSettings["auth"]>;
  functions?: Partial<FirebaseEmulatorSettings["functions"]>;
  storage?: Partial<FirebaseEmulatorSettings["storage"]>;
}

function mergeSettings(
  settings: PartialFirebaseEmulatorSettings,
): FirebaseEmulatorSettings {
  return {
    ...defaultSettings,
    firebaseConfig: {
      ...defaultSettings.firebaseConfig,
      ...settings.firebaseConfig,
    },
    firestore: {
      ...defaultSettings.firestore,
      ...settings.firestore,
    },
    auth: {
      ...defaultSettings.auth,
      ...settings.auth,
    },
    functions: {
      ...defaultSettings.functions,
      ...settings.functions,
    },
    storage: {
      ...defaultSettings.storage,
      ...settings.storage,
    },
  };
}
