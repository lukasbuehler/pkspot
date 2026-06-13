import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const FIREBASE_EMULATOR_STORAGE_KEY = "pkspot:e2e:firebaseEmulators";

export interface FirebaseEmulatorBrowserSettings {
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    appId: string;
  };
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

export interface EmulatorUser {
  uid?: string;
  email: string;
  password: string;
  displayName: string;
}

export interface CreatedEmulatorUser {
  uid: string;
  email: string;
  idToken: string;
  displayName: string;
}

export const defaultFirebaseEmulatorSettings: FirebaseEmulatorBrowserSettings = {
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

export function firebaseEmulatorE2eEnabled(): boolean {
  return (
    process.env["E2E_FIREBASE_EMULATORS"] === "1" ||
    !!process.env["FIRESTORE_EMULATOR_HOST"] ||
    !!process.env["FIREBASE_AUTH_EMULATOR_HOST"]
  );
}

export async function enableFirebaseEmulatorsForPage(
  page: Page,
  settings: FirebaseEmulatorBrowserSettings = defaultFirebaseEmulatorSettings,
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
      localStorage.setItem("acceptedVersion", "5");
    },
    {
      key: FIREBASE_EMULATOR_STORAGE_KEY,
      value: JSON.stringify(settings),
    },
  );
}

export async function resetFirebaseEmulators(
  request: APIRequestContext,
  settings: FirebaseEmulatorBrowserSettings = defaultFirebaseEmulatorSettings,
): Promise<void> {
  await Promise.all([
    deleteIfAvailable(
      request,
      `${settings.auth.url}/emulator/v1/projects/${settings.firebaseConfig.projectId}/accounts`,
    ),
    deleteIfAvailable(
      request,
      firestoreEmulatorUrl(
        settings,
        `/emulator/v1/projects/${settings.firebaseConfig.projectId}/databases/(default)/documents`,
      ),
    ),
  ]);
}

export async function createEmulatorUser(
  request: APIRequestContext,
  user: EmulatorUser,
  settings: FirebaseEmulatorBrowserSettings = defaultFirebaseEmulatorSettings,
): Promise<CreatedEmulatorUser> {
  const response = await request.post(
    `${settings.auth.url}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${settings.firebaseConfig.apiKey}`,
    {
      data: {
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        localId: user.uid,
        returnSecureToken: true,
      },
    },
  );

  expect(response.ok(), await response.text()).toBe(true);

  const body = (await response.json()) as {
    localId: string;
    email: string;
    idToken: string;
    displayName?: string;
  };

  return {
    uid: body.localId,
    email: body.email,
    idToken: body.idToken,
    displayName: body.displayName ?? user.displayName,
  };
}

export async function seedFirestoreDocument(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
  settings: FirebaseEmulatorBrowserSettings = defaultFirebaseEmulatorSettings,
): Promise<void> {
  const response = await request.patch(
    firestoreEmulatorUrl(
      settings,
      `/v1/projects/${settings.firebaseConfig.projectId}/databases/(default)/documents/${path}`,
    ),
    {
      data: {
        fields: toFirestoreFields(data),
      },
    },
  );

  expect(response.ok(), await response.text()).toBe(true);
}

async function deleteIfAvailable(
  request: APIRequestContext,
  url: string,
): Promise<void> {
  const response = await request.delete(url);
  if (response.ok() || response.status() === 404) {
    return;
  }

  throw new Error(`Failed to reset emulator at ${url}: ${await response.text()}`);
}

function firestoreEmulatorUrl(
  settings: FirebaseEmulatorBrowserSettings,
  path: string,
): string {
  return `http://${settings.firestore.host}:${settings.firestore.port}${path}`;
}

function toFirestoreFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
  );
}

function toFirestoreValue(value: unknown): Record<string, unknown> {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: toFirestoreFields(value as Record<string, unknown>),
      },
    };
  }

  throw new Error(`Unsupported Firestore emulator value: ${String(value)}`);
}
