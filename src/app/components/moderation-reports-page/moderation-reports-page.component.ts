import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  ModerationReportItem,
  ModerationReportsService,
  ModerationReportStatus,
} from "../../services/firebase/firestore/moderation-reports.service";

type ReportFilter = "open" | "spot" | "media" | "resolved" | "dismissed" | "all";

@Component({
  selector: "app-moderation-reports-page",
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: "./moderation-reports-page.component.html",
  styleUrl: "./moderation-reports-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationReportsPageComponent implements OnDestroy {
  private readonly _reportsService = inject(ModerationReportsService);
  private readonly _snackbar = inject(MatSnackBar);
  readonly authService = inject(AuthenticationService);

  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly reports = signal<ModerationReportItem[]>([]);
  readonly isLoading = signal(false);
  readonly actionPath = signal<string | null>(null);
  readonly filter = signal<ReportFilter>("open");
  private readonly _authSubscription: Subscription;

  readonly filteredReports = computed(() => {
    const filter = this.filter();
    const reports = this.reports();
    if (filter === "all") {
      return reports;
    }
    if (filter === "spot" || filter === "media") {
      return reports.filter((report) => report.kind === filter);
    }
    return reports.filter((report) => report.status === filter);
  });

  readonly openCount = computed(
    () => this.reports().filter((report) => report.status === "open").length,
  );
  readonly spotCount = computed(
    () => this.reports().filter((report) => report.kind === "spot").length,
  );
  readonly mediaCount = computed(
    () => this.reports().filter((report) => report.kind === "media").length,
  );

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      const isAdmin = this.authService.isAdmin();
      this.isAdmin.set(isAdmin);
      if (isAdmin) {
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    if (!this.isAdmin() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    try {
      this.reports.set(await this._reportsService.getReports());
    } catch (error) {
      console.error("Failed to load moderation reports", error);
      this._snackbar.open($localize`Failed to load reports`, undefined, {
        duration: 4000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async resolve(
    report: ModerationReportItem,
    status: Exclude<ModerationReportStatus, "open">,
  ): Promise<void> {
    if (this.actionPath()) {
      return;
    }

    this.actionPath.set(report.path);
    try {
      await this._reportsService.resolveReport(report, status);
      await this.reload();
      this._snackbar.open($localize`Report updated`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to update report", error);
      this._snackbar.open($localize`Failed to update report`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionPath.set(null);
    }
  }

  async delete(report: ModerationReportItem): Promise<void> {
    if (this.actionPath()) {
      return;
    }

    this.actionPath.set(report.path);
    try {
      await this._reportsService.deleteReport(report);
      await this.reload();
      this._snackbar.open($localize`Report deleted`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to delete report", error);
      this._snackbar.open($localize`Failed to delete report`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionPath.set(null);
    }
  }
}
