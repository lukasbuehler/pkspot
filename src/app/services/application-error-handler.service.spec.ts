import { DOCUMENT } from "@angular/common";
import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "./analytics.service";
import {
  ApplicationErrorHandler,
  isDynamicImportLoadError,
} from "./application-error-handler.service";

function createSessionStorage() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } as unknown as Storage;
}

function configureHandler(options: {
  platformId?: string;
  sessionStorage?: Storage;
} = {}) {
  const analytics: Pick<AnalyticsService, "reportError"> = {
    reportError: vi.fn(),
  };
  const reload = vi.fn();
  const setTimeout = vi.fn((callback: () => void) => {
    callback();
    return 1;
  }) as unknown as Window["setTimeout"];
  const fakeWindow = {
    location: { reload },
    sessionStorage: options.sessionStorage ?? createSessionStorage(),
    setTimeout,
  } as unknown as Window;
  const fakeDocument = { defaultView: fakeWindow } as Document;

  TestBed.configureTestingModule({
    providers: [
      ApplicationErrorHandler,
      { provide: AnalyticsService, useValue: analytics },
      { provide: DOCUMENT, useValue: fakeDocument },
      { provide: PLATFORM_ID, useValue: options.platformId ?? "browser" },
    ],
  });

  return {
    analytics,
    handler: TestBed.inject(ApplicationErrorHandler),
    reload,
    setTimeout,
  };
}

describe("ApplicationErrorHandler", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it("recognizes stale dynamic import chunk load failures", () => {
    expect(
      isDynamicImportLoadError(
        new TypeError(
          "error loading dynamically imported module: https://pkspot.app/en/chunk-LX5C6STU.js",
        ),
      ),
    ).toBe(true);
    expect(
      isDynamicImportLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://pkspot.app/en/chunk-LX5C6STU.js",
        ),
      ),
    ).toBe(true);
    expect(
      isDynamicImportLoadError({
        rejection: new Error("Loading chunk chunk-LX5C6STU failed."),
      }),
    ).toBe(true);
    expect(isDynamicImportLoadError(new Error("Permission denied"))).toBe(false);
  });

  it("reports stale dynamic import errors and reloads the browser once", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sessionStorage = createSessionStorage();
    const { analytics, handler, reload, setTimeout } = configureHandler({
      sessionStorage,
    });
    const error = new TypeError(
      "error loading dynamically imported module: https://pkspot.app/en/chunk-LX5C6STU.js",
    );

    handler.handleError(error);
    handler.handleError(error);

    expect(analytics.reportError).toHaveBeenCalledWith(error, {
      context: "angular_global_error_handler",
      feature: "app",
      action: "uncaught_error",
      severity: "fatal",
      handled: false,
      userFacing: true,
    });
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for non chunk-load errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, reload } = configureHandler();

    handler.handleError(new Error("Validation failed"));

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload during server rendering", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, reload } = configureHandler({ platformId: "server" });

    handler.handleError(
      new TypeError("Failed to fetch dynamically imported module: /en/chunk.js"),
    );

    expect(reload).not.toHaveBeenCalled();
  });
});
