import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from "@angular/core";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDialog } from "@angular/material/dialog";
import { firstValueFrom, Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  ModerationReportItem,
  ModerationReportsService,
  SpotWarningInput,
} from "../../services/firebase/firestore/moderation-reports.service";
import { ModerationActionType } from "../../../db/schemas/ModerationActionSchema";
import { SpotWarningDialogComponent } from "../spot-warning-dialog/spot-warning-dialog.component";

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
    SystemDatePipe,
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
  private readonly _dialog = inject(MatDialog);
  private readonly _router = inject(Router);
  readonly authService = inject(AuthenticationService);

  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly reports = signal<ModerationReportItem[]>([]);
  readonly isLoading = signal(false);
  readonly actionPath = signal<string | null>(null);
  readonly revealPath = signal<string | null>(null);
  readonly sensitiveMediaUrls = signal<Record<string, string>>({});
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
      | "close_report"
      | "keep_warning"
      | "publish_spot_warning"
      | "delete_media"
      | "delete_spot"
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

    if (actionType === "publish_spot_warning") {
      const spotWarning = await firstValueFrom<SpotWarningInput | undefined>(
        this._dialog
          .open<SpotWarningDialogComponent, { reason: string }, SpotWarningInput>(
            SpotWarningDialogComponent,
            { data: { reason: report.reason } },
          )
          .afterClosed(),
      );
      if (!spotWarning) {
        return;
      }

      this.actionPath.set(report.path);
      try {
        await this._reportsService.handleReport(
          report,
          actionType,
          undefined,
          spotWarning,
        );
        await this.reload();
        this._snackbar.open($localize`Public Spot warning published`, undefined, {
          duration: 3000,
        });
      } catch (error) {
        console.error("Failed to publish Spot warning", error);
        this._snackbar.open($localize`Failed to publish Spot warning`, undefined, {
          duration: 4000,
        });
      } finally {
        this.actionPath.set(null);
      }
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

  async revealSensitiveMedia(report: ModerationReportItem): Promise<void> {
    if (this.revealPath() || this.sensitiveMediaUrls()[report.path]) {
      return;
    }
    if (
      !globalThis.confirm(
        $localize`This media was flagged by automated safety scanning and may be disturbing. Reveal it for manual moderation?`,
      )
    ) {
      return;
    }

    this.revealPath.set(report.path);
    try {
      const url = await this._reportsService.getModerationMediaPreview(report);
      this.sensitiveMediaUrls.update((urls) => ({
        ...urls,
        [report.path]: url,
      }));
    } catch (error) {
      console.error("Failed to load sensitive media", error);
      this._snackbar.open($localize`Failed to load quarantined media`, undefined, {
        duration: 4000,
      });
    } finally {
      this.revealPath.set(null);
    }
  }

  async openIncident(report: ModerationReportItem): Promise<void> {
    if (this.actionPath()) {
      return;
    }
    this.actionPath.set(report.path);
    try {
      const incidentPath =
        report.incidentPath ??
        (await this._reportsService.createSafetyIncident(report));
      const incidentId = incidentPath.split("/").at(-1);
      if (!incidentId) {
        throw new Error("Incident id missing from response");
      }
      await this._router.navigate(["/moderation/incidents", incidentId]);
    } catch (error) {
      console.error("Failed to open safety incident", error);
      this._snackbar.open($localize`Failed to open safety incident`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionPath.set(null);
    }
  }
}
