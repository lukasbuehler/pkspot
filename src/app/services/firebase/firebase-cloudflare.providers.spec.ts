import { TestBed } from "@angular/core/testing";
import {
  EnvironmentInjector,
  PLATFORM_ID,
  REQUEST_CONTEXT,
  createEnvironmentInjector,
} from "@angular/core";
import { getApps } from "firebase/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SsrRequestScope } from "../../../ssr-request-scope";
import {
  createFirebaseCloudflareAppCheckTokenMinter,
  provideFirebaseCloudflareClient,
} from "./firebase-cloudflare.providers";
import {
  FIREBASE_APP,
  FIREBASE_FIRESTORE,
  FIREBASE_FUNCTIONS,
  FIREBASE_USE_FETCH_STREAMS,
  provideFirebaseClient,
} from "./firebase-client.providers";

afterEach(() => vi.unstubAllEnvs());

describe("createFirebaseCloudflareAppCheckTokenMinter", () => {
  it("isolates simultaneous Firebase clients and releases them after each render", async () => {
    vi.stubEnv("PKSPOT_SSR_FIREBASE_APP_ID", "");
    const parent = TestBed.inject(EnvironmentInjector);
    const createRequest = () => {
      const scope = new SsrRequestScope();
      const injector = createEnvironmentInjector(
        [
          provideFirebaseClient(),
          provideFirebaseCloudflareClient(),
          { provide: REQUEST_CONTEXT, useValue: scope },
          { provide: PLATFORM_ID, useValue: "server" },
        ],
        parent,
      );
      return {
        scope,
        injector,
        app: injector.get(FIREBASE_APP),
        firestore: injector.get(FIREBASE_FIRESTORE),
      };
    };
    const first = createRequest();
    const second = createRequest();
    try {
      expect(first.app).not.toBe(second.app);
      expect(first.firestore).not.toBe(second.firestore);
      expect(first.firestore.app).toBe(first.app);
      expect(second.firestore.app).toBe(second.app);
      expect(second.injector.get(FIREBASE_FUNCTIONS).app).toBe(second.app);
      expect(first.injector.get(FIREBASE_FIRESTORE)).toBe(first.firestore);
      const closing = first.scope.close();
      await Promise.resolve();
      expect(getApps()).toContain(first.app);
      first.injector.destroy();
      await closing;
      expect(getApps()).not.toContain(first.app);
      expect(getApps()).toContain(second.app);
      expect(second.injector.get(FIREBASE_FIRESTORE)).toBe(second.firestore);
    } finally {
      if (!first.injector.destroyed) first.injector.destroy();
      second.injector.destroy();
      await Promise.all([first.scope.close(), second.scope.close()]);
    }
    expect(getApps()).not.toContain(second.app);
  });

  it("shares only completed tokens between requests and refreshes expired ones", async () => {
    const environment = {
      PKSPOT_SSR_APP_CHECK_BROKER_URL: "https://cache.example.test/token",
      PKSPOT_SSR_APP_CHECK_BROKER_SECRET: "secret",
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        token: "token",
        expireTimeMillis: Date.now() + 3_600_000,
      }),
    );
    const first = createFirebaseCloudflareAppCheckTokenMinter(
      environment,
      fetcher,
    );
    const second = createFirebaseCloudflareAppCheckTokenMinter(
      environment,
      fetcher,
    );
    await first.mintToken("cache-test");
    await second.mintToken("cache-test");
    expect(fetcher).toHaveBeenCalledOnce();
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3_600_000);
    try {
      await second.mintToken("cache-test");
    } finally {
      now.mockRestore();
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not reuse an unfinished broker request from another request", async () => {
    const environment = {
      PKSPOT_SSR_APP_CHECK_BROKER_URL: "https://concurrent.example.test/token",
      PKSPOT_SSR_APP_CHECK_BROKER_SECRET: "secret",
    };
    let resolveFirst!: (response: Response) => void;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        Response.json({
          token: "second",
          expireTimeMillis: Date.now() + 3_600_000,
        }),
      );
    const first = createFirebaseCloudflareAppCheckTokenMinter(
      environment,
      fetcher,
    ).mintToken("concurrent-test");
    const second = createFirebaseCloudflareAppCheckTokenMinter(
      environment,
      fetcher,
    ).mintToken("concurrent-test");
    try {
      await expect(second).resolves.toMatchObject({ token: "second" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      resolveFirst(
        Response.json({
          token: "first",
          expireTimeMillis: Date.now() + 3_600_000,
        }),
      );
      await first;
    }
  });

  it("uses the fetch transport supported by the Worker runtime", () => {
    TestBed.configureTestingModule({
      providers: [provideFirebaseCloudflareClient()],
    });

    expect(TestBed.inject(FIREBASE_USE_FETCH_STREAMS)).toBe(true);
  });

  it("creates a broker-backed minter from Worker bindings", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        token: "token",
        expireTimeMillis: Date.now() + 3_600_000,
      }),
    );
    const minter = createFirebaseCloudflareAppCheckTokenMinter(
      {
        PKSPOT_SSR_APP_CHECK_BROKER_URL: "https://broker.example.test/token",
        PKSPOT_SSR_APP_CHECK_BROKER_SECRET: "secret",
      },
      fetcher,
    );

    await expect(minter.mintToken("1:123:web:ssr")).resolves.toMatchObject({
      token: "token",
    });
  });

  it("fails closed when a binding is missing", () => {
    expect(() => createFirebaseCloudflareAppCheckTokenMinter({})).toThrow(
      "broker bindings are incomplete",
    );
  });

  it("requires an encrypted broker connection", () => {
    expect(() =>
      createFirebaseCloudflareAppCheckTokenMinter({
        PKSPOT_SSR_APP_CHECK_BROKER_URL: "http://broker.example.test/token",
        PKSPOT_SSR_APP_CHECK_BROKER_SECRET: "secret",
      }),
    ).toThrow("must use HTTPS");
  });
});
