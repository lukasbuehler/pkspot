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
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Subscription } from "rxjs";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  ModerationContactMessageItem,
  ModerationReportItem,
  ModerationReportsService,
} from "../../services/firebase/firestore/moderation-reports.service";
import { ModerationActionType } from "../../../db/schemas/ModerationActionSchema";

@Component({
  selector: "app-moderation-dashboard-page",
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: "./moderation-dashboard-page.component.html",
  styleUrl: "./moderation-dashboard-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationDashboardPageComponent implements OnDestroy {
  private readonly _reportsService = inject(ModerationReportsService);
  private readonly _snackbar = inject(MatSnackBar);
  readonly authService = inject(AuthenticationService);

  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly isLoading = signal(false);
  readonly actionPath = signal<string | null>(null);
  readonly reports = signal<ModerationReportItem[]>([]);
  readonly contactMessages = signal<ModerationContactMessageItem[]>([]);
  private readonly _authSubscription: Subscription;

  readonly openReportCount = computed(
    () => this.reports().filter((report) => report.status === "open").length,
  );
  readonly spotReportCount = computed(
    () => this.reports().filter((report) => report.kind === "spot").length,
  );
  readonly mediaReportCount = computed(
    () => this.reports().filter((report) => report.kind === "media").length,
  );
  readonly profileReportCount = computed(
    () => this.reports().filter((report) => report.kind === "profile").length,
  );
  readonly recentOpenReports = computed(() =>
    this.reports()
      .filter((report) => report.status === "open")
      .slice(0, 5),
  );
  readonly recentContactMessages = computed(() =>
    this.contactMessages().slice(0, 8),
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
      const [reports, contactMessages] = await Promise.all([
        this._reportsService.getReports(),
        this._reportsService.getContactMessages(),
      ]);
      this.reports.set(reports);
      this.contactMessages.set(contactMessages);
    } catch (error) {
      console.error("Failed to load moderation dashboard", error);
      this._snackbar.open($localize`Failed to load moderation dashboard`, undefined, {
        duration: 4000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async handleContactMessage(
    message: ModerationContactMessageItem,
    actionType: Extract<
      ModerationActionType,
      "archive_contact_message" | "delete_contact_message"
    >,
  ): Promise<void> {
    if (this.actionPath()) {
      return;
    }

    if (
      actionType === "delete_contact_message" &&
      !globalThis.confirm(
        $localize`Delete this contact message from the active inbox? The message will still be recorded in moderation provenance.`,
      )
    ) {
      return;
    }

    this.actionPath.set(message.path);
    try {
      await this._reportsService.handleContactMessage(message, actionType);
      await this.reload();
      this._snackbar.open($localize`Contact message archived`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to handle contact message", error);
      this._snackbar.open($localize`Failed to update contact message`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionPath.set(null);
    }
  }
}
