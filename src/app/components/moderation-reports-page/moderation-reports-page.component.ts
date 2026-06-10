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
} from "../../services/firebase/firestore/moderation-reports.service";
import { ModerationActionType } from "../../../db/schemas/ModerationActionSchema";

type ReportFilter =
  | "open"
  | "spot"
  | "media"
  | "profile"
  | "resolved"
  | "dismissed"
  | "all";

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
    if (filter === "profile") {
      return reports.filter((report) => report.kind === "profile");
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
  readonly profileCount = computed(
    () => this.reports().filter((report) => report.kind === "profile").length,
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

  async handle(
    report: ModerationReportItem,
    actionType: Extract<
      ModerationActionType,
      "close_report" | "keep_warning" | "delete_media" | "delete_spot"
    >,
  ): Promise<void> {
    if (this.actionPath()) {
      return;
    }

    if (
      actionType === "delete_spot" &&
      !globalThis.confirm(
        $localize`Delete this spot and all of its nested data? This action is permanent and will be recorded in moderation provenance.`,
      )
    ) {
      return;
    }

    if (
      actionType === "delete_media" &&
      !globalThis.confirm(
        $localize`Delete this media item from its spot or event? This action is permanent and will be recorded in moderation provenance.`,
      )
    ) {
      return;
    }

    this.actionPath.set(report.path);
    try {
      await this._reportsService.handleReport(report, actionType);
      await this.reload();
      this._snackbar.open($localize`Moderation action recorded`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to handle report", error);
      this._snackbar.open($localize`Failed to handle report`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionPath.set(null);
    }
  }
}
