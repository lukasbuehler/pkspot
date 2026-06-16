import { afterEach, describe, expect, it } from "vitest";
import {
  FIREBASE_EMULATOR_STORAGE_KEY,
  getFirebaseConfig,
  getFirebaseEmulatorSettings,
} from "./firebase-emulator.config";
import { environment } from "../../../environments/environment.default";

describe("firebase emulator config", () => {
  afterEach(() => {
    localStorage.removeItem(FIREBASE_EMULATOR_STORAGE_KEY);
  });

  it("uses the normal environment Firebase config by default", () => {
    expect(getFirebaseEmulatorSettings()).toBeNull();
    expect(getFirebaseConfig()).toBe(environment.keys.firebaseConfig);
  });

  it("enables the default local emulator project with a simple storage flag", () => {
    localStorage.setItem(FIREBASE_EMULATOR_STORAGE_KEY, "1");

    const settings = getFirebaseEmulatorSettings();

    expect(settings?.firebaseConfig.projectId).toBe("demo-pkspot");
    expect(settings?.firebaseConfig.apiKey).toBe("demo-api-key");
    expect(settings?.firestore).toEqual({ host: "127.0.0.1", port: 8080 });
    expect(settings?.auth.url).toBe("http://127.0.0.1:9099");
    expect(getFirebaseConfig().projectId).toBe("demo-pkspot");
  });

  it("accepts custom emulator endpoints for CI or local port conflicts", () => {
    localStorage.setItem(
      FIREBASE_EMULATOR_STORAGE_KEY,
      JSON.stringify({
        firebaseConfig: {
          projectId: "custom-project",
        },
        firestore: {
          host: "localhost",
          port: 18080,
        },
        auth: {
          url: "http://localhost:19099",
        },
        functions: {
          port: 15001,
        },
      }),
    );

    const settings = getFirebaseEmulatorSettings();

    expect(settings?.firebaseConfig.projectId).toBe("custom-project");
    expect(settings?.firebaseConfig.apiKey).toBe("demo-api-key");
    expect(settings?.firestore).toEqual({ host: "localhost", port: 18080 });
    expect(settings?.auth.url).toBe("http://localhost:19099");
    expect(settings?.functions).toEqual({ host: "127.0.0.1", port: 15001 });
    expect(settings?.storage).toEqual({ host: "127.0.0.1", port: 9199 });
  });

  it("ignores invalid custom JSON and falls back to the normal config", () => {
    localStorage.setItem(FIREBASE_EMULATOR_STORAGE_KEY, "{not-json");

    expect(getFirebaseEmulatorSettings()).toBeNull();
    expect(getFirebaseConfig()).toBe(environment.keys.firebaseConfig);
  });

  it("treats explicit false-like values as disabled", () => {
    localStorage.setItem(FIREBASE_EMULATOR_STORAGE_KEY, "false");

    expect(getFirebaseEmulatorSettings()).toBeNull();

    localStorage.setItem(FIREBASE_EMULATOR_STORAGE_KEY, "0");

    expect(getFirebaseEmulatorSettings()).toBeNull();
  });
});
