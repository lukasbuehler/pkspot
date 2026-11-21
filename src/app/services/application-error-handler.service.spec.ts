import { DOCUMENT } from "@angular/common";
import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatSnackBar } from "@angular/material/snack-bar";
import { AnalyticsService } from "./analytics.service";
import {
  ApplicationErrorHandler,
  FailedNavigationTarget,
  isAngularHmrModuleError,
  isDynamicImportLoadError,
  offlinePageName,
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
  offline?: boolean;
} = {}) {
  const analytics: Pick<AnalyticsService, "reportError"> = {
    reportError: vi.fn(),
  };
  const reload = vi.fn();
  const assign = vi.fn();
  const snackbar = { open: vi.fn() };
  const setTimeout = vi.fn((callback: () => void) => {
    callback();
    return 1;
  }) as unknown as Window["setTimeout"];
  const listeners = new Map<string, () => void>();
  const documentListeners = new Map<string, (event: Event) => void>();
  const fakeWindow = {
    document: {
      addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
        documentListeners.set(type, listener);
      }),
      removeEventListener: vi.fn(),
    },
    location: { reload, assign, href: "https://pkspot.app/de/map" },
    navigator: { onLine: !options.offline },
    sessionStorage: options.sessionStorage ?? createSessionStorage(),
    setTimeout,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
  } as unknown as Window;
  const fakeDocument = { defaultView: fakeWindow } as Document;

  TestBed.configureTestingModule({
    providers: [
      ApplicationErrorHandler,
      { provide: AnalyticsService, useValue: analytics },
      { provide: DOCUMENT, useValue: fakeDocument },
      { provide: PLATFORM_ID, useValue: options.platformId ?? "browser" },
      { provide: MatSnackBar, useValue: snackbar },
    ],
  });

  return {
    assign,
    fakeWindow,
    goOnline: () => listeners.get("online")?.(),
    tapLink: () =>
      documentListeners.get("click")?.({
        target: { closest: (selector: string) => (selector === "a[href]" ? {} : null) },
      } as unknown as Event),
    failedNavigation: TestBed.inject(FailedNavigationTarget),
    snackbar,
    analytics,
    handler: TestBed.inject(ApplicationErrorHandler),
    reload,
    setTimeout,
  };
}

describe("ApplicationErrorHandler", () => {
  it("preserves the error message when WebKit supplies a frames-only stack", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, reload } = configureHandler();
    const error = new Error("Script error.");
    error.stack = "r@capacitor://pkspot.app/de/chunk.js:4:23474";

    handler.handleError(error);

    expect(log).toHaveBeenCalledWith("[AppError]", `Error: Script error.\n${error.stack}`);
    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps native console errors readable after JSON serialization", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler } = configureHandler();
    handler.handleError(new TypeError("Network request failed"));
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError: Network request failed");
  });

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

  it("recognizes Angular HMR module namespace failures", () => {
    expect(
      isAngularHmrModuleError(
        new TypeError(
          'can\'t access property "PlatformService", ɵhmr8 is undefined',
        ),
      ),
    ).toBe(true);
    expect(isAngularHmrModuleError(new Error("Permission denied"))).toBe(false);
  });

  it("reloads once for Angular HMR module namespace failures", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, reload, setTimeout } = configureHandler();
    const error = new TypeError(
      'can\'t access property "PlatformService", ɵhmr8 is undefined',
    );

    handler.handleError(error);
    handler.handleError(error);

    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("stays on the page and explains when a page part cannot load offline", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sessionStorage = createSessionStorage();
    const { handler, reload, snackbar } = configureHandler({ offline: true, sessionStorage });

    handler.handleError(
      new TypeError("Failed to fetch dynamically imported module: /de/chunk.js"),
    );

    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    expect(snackbar.open).toHaveBeenCalledWith(
      "You're offline. The page you chose opens once you're connected again.",
      "OK",
      { duration: 8000 },
    );
  });

  it("opens the tapped page once the connection is back", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, assign, failedNavigation, goOnline } = configureHandler({ offline: true });
    const error = new TypeError("Failed to fetch dynamically imported module: /de/chunk.js");

    failedNavigation.url = "/de/events";
    handler.handleError(error);
    failedNavigation.url = "/de/train";
    handler.handleError(error);
    expect(assign).not.toHaveBeenCalled();

    goOnline();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/de/train");
  });

  it("does not open the tapped page after reconnecting if another link was tapped", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, assign, failedNavigation, goOnline, tapLink } = configureHandler({ offline: true });

    failedNavigation.url = "/de/events";
    handler.handleError(new TypeError("Failed to fetch dynamically imported module: /de/chunk.js"));
    tapLink();

    goOnline();
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not open the tapped page after reconnecting if the person moved on", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, assign, failedNavigation, goOnline, fakeWindow } = configureHandler({ offline: true });

    failedNavigation.url = "/de/events";
    handler.handleError(new TypeError("Failed to fetch dynamically imported module: /de/chunk.js"));
    (fakeWindow.location as { href: string }).href = "https://pkspot.app/de/map/lindenhof";

    goOnline();
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens the page a navigation was heading to once its code can load again", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { handler, reload, assign, failedNavigation } = configureHandler();
    const error = new TypeError("Failed to fetch dynamically imported module: /de/chunk.js");

    failedNavigation.url = "/de/events?when=upcoming";
    handler.handleError(error);
    failedNavigation.url = "/de/events?when=upcoming";
    handler.handleError(error);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/de/events?when=upcoming");
    expect(reload).not.toHaveBeenCalled();
    expect(failedNavigation.url).toBeNull();
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

  it("names a top-level page in the offline notice, with or without a locale", () => {
    expect(offlinePageName("/de/events")).toBe("Events");
    expect(offlinePageName("/train?tab=log")).toBe("Train");
    expect(offlinePageName("https://pkspot.app/en/map/spots/rwi")).toBe("Map");
    expect(offlinePageName("/de/settings/account")).toBeNull();
  });
});
