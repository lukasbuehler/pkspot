import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import type { OwnReportSummary } from "../../../db/schemas/ReportLifecycleSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { ReporterReportsService } from "../../services/firebase/firestore/reporter-reports.service";

@Component({
  selector: "app-my-reports-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: "./my-reports-page.component.html",
  styleUrl: "./my-reports-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyReportsPageComponent {
  private readonly _reports = inject(ReporterReportsService);
  readonly auth = inject(AuthenticationService);
  readonly reports = signal<OwnReportSummary[]>([]);
  readonly openReports = computed(() => this.reports().filter((report) => report.status === "open"));
  readonly historyReports = computed(() => this.reports().filter((report) => report.status !== "open"));
  readonly loading = signal(true);
  readonly failed = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.auth.isSignedIn) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    try {
      this.reports.set(await this._reports.listMine());
    } catch (error) {
      console.error("Could not load reporter reports", error);
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  reportPath(report: OwnReportSummary): string | unknown[] {
    const spotId = report.kind === "spot" ? report.spot?.id :
      report.context === "spot" ? report.targetId : undefined;
    return spotId ? ["/map/spots", spotId] : "/notifications";
  }

  reportTitle(report: OwnReportSummary): string {
    return report.kind === "spot" ? report.spot?.name ?? $localize`Spot` : $localize`Media report`;
  }
}
