import { PLATFORM_ID } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { MatDialog } from "@angular/material/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppCheckErrorDialogComponent } from "../../components/app-check-error-dialog/app-check-error-dialog.component";
import { AppCheckFailureWarningService } from "./app-check-failure-warning.service";
import { FirebaseAppCheckService } from "./app-check.service";

describe("AppCheckFailureWarningService", () => {
  const initialize = vi.fn();
  const open = vi.fn();
  let state: "ready" | "failed";

  beforeEach(() => {
    vi.clearAllMocks();
    state = "failed";
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
      ],
    });
    return TestBed.inject(AppCheckFailureWarningService);
  }

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
