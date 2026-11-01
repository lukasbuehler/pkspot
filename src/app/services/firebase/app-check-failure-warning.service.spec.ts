import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppCheckErrorDialogComponent } from "../../components/app-check-error-dialog/app-check-error-dialog.component";
import { AppCheckFailureWarningService } from "./app-check-failure-warning.service";
import { MapsApiService } from "../maps-api.service";
import { PlatformService } from "../platform.service";
import { FirebaseAppCheckService } from "./app-check.service";

describe("AppCheckFailureWarningService", () => {
  const initialize = vi.fn();
  const open = vi.fn();
  let state: "ready" | "failed";
  let platform: "web" | "ios";
  let firstTiles: Promise<void>;
  let markFirstTiles: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    state = "failed";
    platform = "web";
    firstTiles = new Promise((resolve) => (markFirstTiles = resolve));
    initialize.mockResolvedValue(undefined);
  });

  function configure(platformId: "browser" | "server") {
    TestBed.configureTestingModule({
      providers: [
        AppCheckFailureWarningService,
        { provide: PLATFORM_ID, useValue: platformId },
        {
          provide: FirebaseAppCheckService,
          useValue: {
            initialize,
            status: () => ({
              state,
              platform: "web",
              message: "attestation failed",
            }),
          },
        },
        { provide: MatDialog, useValue: { open } },
        {
          provide: MapsApiService,
          useValue: { firstTilesLoaded: firstTiles },
        },
        {
          provide: PlatformService,
          useValue: { getPlatform: () => platform },
        },
      ],
    });
    return TestBed.inject(AppCheckFailureWarningService);
  }

  describe("initializeAfterStartup", () => {
    afterEach(() => vi.useRealTimers());

    it("downloads reCAPTCHA only after the first map tiles", async () => {
      const started = configure("browser").initializeAfterStartup(20_000);
      await Promise.resolve();
      expect(initialize).not.toHaveBeenCalled();

      markFirstTiles();
      await started;
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    it("still starts when no map draws", async () => {
      vi.useFakeTimers();
      const started = configure("browser").initializeAfterStartup(3_000);
      await vi.advanceTimersByTimeAsync(3_000);
      await started;
      expect(initialize).toHaveBeenCalledTimes(1);
    });

    it("starts at once in the native apps", async () => {
      platform = "ios";
      await configure("browser").initializeAfterStartup(20_000);
      expect(initialize).toHaveBeenCalledTimes(1);
    });
  });

  it("opens one warning when browser attestation fails", async () => {
    const service = configure("browser");

    await service.initializeAndWarn();
    await service.initializeAndWarn();

    expect(initialize).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(
      AppCheckErrorDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ state: "failed" }),
      }),
    );
  });

  it("does not open a warning after successful attestation", async () => {
    state = "ready";

    await configure("browser").initializeAndWarn();

    expect(open).not.toHaveBeenCalled();
  });

  it("never opens a warning during server rendering", async () => {
    await configure("server").initializeAndWarn();

    expect(initialize).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });
});
