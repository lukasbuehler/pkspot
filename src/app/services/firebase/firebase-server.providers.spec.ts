import { deleteApp, getApps } from "firebase/app";
import type { AppCheck, AppCheckOptions } from "firebase/app-check";
import { describe, expect, it, vi } from "vitest";
import { initializeFirebaseServerApp } from "./firebase-server.providers";

const appCheckState = vi.hoisted(() => ({
  options: undefined as AppCheckOptions | undefined,
}));

vi.mock("firebase/app-check", async (importOriginal) => {
  const original = await importOriginal<typeof import("firebase/app-check")>();
  return {
    ...original,
    initializeAppCheck: vi.fn((_app, options: AppCheckOptions) => {
      appCheckState.options = options;
      return {} as AppCheck;
    }),
  };
});

const baseConfig = {
  projectId: "demo-pkspot-ssr",
  appId: "browser-app",
  apiKey: "public-api-key",
};

describe("initializeFirebaseServerApp", () => {
  it("keeps request-specific clients on the SSR identity without refresh timers", async () => {
    const environment = { PKSPOT_SSR_FIREBASE_APP_ID: "1:123:web:request-ssr" };
    const tokenMinter = {
      mintToken: vi.fn(async () => ({
        token: "request-token",
        expireTimeMillis: Date.now() + 3_600_000,
      })),
    };
    const first = initializeFirebaseServerApp(
      environment,
      baseConfig,
      tokenMinter,
      {
        name: "SSR_REQUEST_FIRST",
        autoRefresh: false,
      },
    );
    const second = initializeFirebaseServerApp(
      environment,
      baseConfig,
      tokenMinter,
      {
        name: "SSR_REQUEST_SECOND",
        autoRefresh: false,
      },
    );
    try {
      expect(first).not.toBe(second);
      expect(first.options.appId).toBe("1:123:web:request-ssr");
      expect(second.options.appId).toBe(first.options.appId);
      expect(appCheckState.options?.isTokenAutoRefreshEnabled).toBe(false);
      await expect(
        appCheckState.options?.provider.getToken(),
      ).resolves.toMatchObject({ token: "request-token" });
      expect(tokenMinter.mintToken).toHaveBeenCalledWith(
        "1:123:web:request-ssr",
      );
    } finally {
      await Promise.all([deleteApp(first), deleteApp(second)]);
    }
  });

  it("supplies cached host-minted tokens to the SSR Firebase client", async () => {
    const environment = {
      PKSPOT_SSR_FIREBASE_APP_ID: "1:123:web:ssr",
    };
    const tokenMinter = {
      mintToken: vi.fn(async () => ({
        token: "signed-token",
        expireTimeMillis: Date.now() + 3_600_000,
      })),
    };

    const app = initializeFirebaseServerApp(
      environment,
      baseConfig,
      tokenMinter,
    );

    expect(app.name).toBe("PKSPOT_SSR");
    expect(app.options.appId).toBe("1:123:web:ssr");
    expect(
      initializeFirebaseServerApp(environment, baseConfig, tokenMinter),
    ).toBe(app);
    expect(getApps().filter(({ name }) => name === "PKSPOT_SSR")).toHaveLength(
      1,
    );

    const provider = appCheckState.options?.provider;
    expect(provider).toBeDefined();
    await expect(provider?.getToken()).resolves.toMatchObject({
      token: "signed-token",
    });
    await expect(provider?.getToken()).resolves.toMatchObject({
      token: "signed-token",
    });
    expect(tokenMinter.mintToken).toHaveBeenCalledOnce();
    expect(tokenMinter.mintToken).toHaveBeenCalledWith("1:123:web:ssr");
  });

  it("preserves unattested SSR while the SSR app ID is absent", () => {
    const app = initializeFirebaseServerApp({}, baseConfig);

    expect(app.name).toBe("[DEFAULT]");
    expect(app.options.appId).toBe("browser-app");
  });

  it("fails fast when the host does not supply a token minter", () => {
    expect(() =>
      initializeFirebaseServerApp(
        { PKSPOT_SSR_FIREBASE_APP_ID: "1:123:web:ssr" },
        baseConfig,
      ),
    ).toThrow("requires a hosting token minter");
  });
});
