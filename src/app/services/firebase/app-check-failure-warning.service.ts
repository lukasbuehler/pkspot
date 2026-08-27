import { isPlatformBrowser } from "@angular/common";
import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { MatDialog } from "@angular/material/dialog";
import { AppCheckErrorDialogComponent } from "../../components/app-check-error-dialog/app-check-error-dialog.component";
import { FirebaseAppCheckService } from "./app-check.service";

@Injectable({ providedIn: "root" })
export class AppCheckFailureWarningService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly appCheck = inject(FirebaseAppCheckService);
  private readonly dialog = inject(MatDialog);
  private warningShown = false;

  async initializeAndWarn(): Promise<void> {
    try {
      await this.appCheck.initialize();
    } catch (error) {
      console.error("App Check initialization failed", error);
    }

    const status = this.appCheck.status();
    if (
      !isPlatformBrowser(this.platformId) ||
      status.state !== "failed" ||
      this.warningShown
    ) {
      return;
    }

    this.warningShown = true;
    this.dialog.open(AppCheckErrorDialogComponent, {
      data: status,
      maxWidth: "560px",
      width: "calc(100vw - 32px)",
    });
  }
}
