import { getApps } from "firebase/app";
import { describe, expect, it } from "vitest";
import { initializeFirebaseServerApp } from "./firebase-server.providers";

const baseConfig = {
  projectId: "demo-pkspot-ssr",
  appId: "browser-app",
  apiKey: "public-api-key",
};

describe("initializeFirebaseServerApp", () => {
  it("initializes a distinct, reusable App Check client for SSR", () => {
    const environment = {
      PKSPOT_SSR_FIREBASE_APP_ID: "1:123:web:ssr",
      PKSPOT_SSR_APP_CHECK_DEBUG_TOKEN: "server-secret",
    };

    const app = initializeFirebaseServerApp(environment, baseConfig);

    expect(app.name).toBe("PKSPOT_SSR");
    expect(app.options.appId).toBe("1:123:web:ssr");
    expect(initializeFirebaseServerApp(environment, baseConfig)).toBe(app);
    expect(getApps().filter(({ name }) => name === "PKSPOT_SSR")).toHaveLength(1);
  });

  it("preserves unattested SSR while both settings are absent", () => {
    const app = initializeFirebaseServerApp({}, baseConfig);

    expect(app.name).toBe("[DEFAULT]");
    expect(app.options.appId).toBe("browser-app");
  });

  it("fails fast when only half of the server credential is configured", () => {
    expect(() =>
      initializeFirebaseServerApp(
        { PKSPOT_SSR_FIREBASE_APP_ID: "1:123:web:ssr" },
        baseConfig,
      ),
    ).toThrow("requires both the Firebase app ID and debug token");
  });
});
