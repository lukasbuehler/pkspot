import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { SafetyCaseStatus } from "../../../db/schemas/SafetyCaseSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  SafetyCasesService,
  type SafetyCaseListItem,
} from "../../services/safety-cases.service";

@Component({
  selector: "app-moderation-cases-page",
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    RouterLink,
  ],
  templateUrl: "./moderation-cases-page.component.html",
  styleUrl: "./moderation-cases-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationCasesPageComponent {
  private readonly safetyCases = inject(SafetyCasesService);
  private readonly snackbar = inject(MatSnackBar);
  readonly auth = inject(AuthenticationService);

  readonly loading = signal(false);
  readonly cases = signal<SafetyCaseListItem[]>([]);
  readonly status = signal<SafetyCaseStatus | "open" | "all">("open");
  readonly statusOptions: readonly {
    value: SafetyCaseStatus | "open" | "all";
    label: string;
  }[] = [
    { value: "open", label: $localize`All open cases` },
    { value: "received", label: $localize`Received` },
    { value: "triaged", label: $localize`Triaged` },
    { value: "under_review", label: $localize`Under review` },
    { value: "awaiting_information", label: $localize`Awaiting information` },
    { value: "resolved", label: $localize`Resolved` },
    { value: "closed", label: $localize`Closed` },
    { value: "all", label: $localize`All cases` },
  ];
  readonly visibleCases = computed(() => {
    const status = this.status();
    if (status === "all") return this.cases();
    if (status === "open") {
      return this.cases().filter(
        (item) => item.status !== "resolved" && item.status !== "closed",
      );
    }
    return this.cases().filter((item) => item.status === status);
  });
  readonly overdueCount = computed(() => {
    const now = Date.now();
    return this.cases().filter(
      (item) =>
        item.status !== "resolved" &&
        item.status !== "closed" &&
        item.target_resolution_at < now,
    ).length;
  });

  constructor() {
    effect(() => {
      if (this.auth.authorizationStateResolved() && this.auth.isAdmin()) {
        void this.reload();
      }
    });
  }

  async reload(): Promise<void> {
    if (this.loading() || !this.auth.isAdmin()) return;
    this.loading.set(true);
    try {
      this.cases.set(await this.safetyCases.listAdminCases());
    } catch (error) {
      console.error("Could not load safety cases", error);
      this.snackbar.open($localize`Could not load safety cases.`, undefined, {
        duration: 5000,
      });
    } finally {
      this.loading.set(false);
    }
  }

  statusChanged(value: SafetyCaseStatus | "open" | "all"): void {
    this.status.set(value);
  }

  isOverdue(item: SafetyCaseListItem): boolean {
    return (
      item.status !== "resolved" &&
      item.status !== "closed" &&
      item.target_resolution_at < Date.now()
    );
  }
}
