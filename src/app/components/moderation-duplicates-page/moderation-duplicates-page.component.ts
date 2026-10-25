import {ChangeDetectionStrategy, Component, inject, signal} from "@angular/core";
import {takeUntilDestroyed} from "@angular/core/rxjs-interop";
import {DecimalPipe} from "@angular/common";
import {RouterLink} from "@angular/router";
import {MatButtonModule} from "@angular/material/button";
import {MatIconModule} from "@angular/material/icon";
import {MatProgressSpinnerModule} from "@angular/material/progress-spinner";
import {SystemDatePipe} from "../../pipes/system-date.pipe";
import {AuthenticationService} from "../../services/firebase/authentication.service";
import {ModerationReportsService, ModerationDuplicateGroup} from "../../services/firebase/firestore/moderation-reports.service";

@Component({
  selector: "app-moderation-duplicates-page",
  imports: [RouterLink, DecimalPipe, SystemDatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./moderation-duplicates-page.component.html",
  styleUrl: "./moderation-duplicates-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationDuplicatesPageComponent {
  readonly auth = inject(AuthenticationService);
  private readonly reports = inject(ModerationReportsService);
  readonly groups = signal<ModerationDuplicateGroup[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly isAdmin = signal(false);
  private generation = 0;

  constructor() {
    this.auth.authState$.pipe(takeUntilDestroyed()).subscribe(() => {
      ++this.generation;
      this.isAdmin.set(this.auth.isAdmin());
      this.groups.set([]);
      this.loading.set(false);
      if (this.isAdmin()) void this.reload();
    });
  }

  async reload(): Promise<void> {
    if (!this.isAdmin() || this.loading()) return;
    const generation = ++this.generation;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const groups = await this.reports.getDuplicateSpotGroups();
      if (generation === this.generation) this.groups.set(groups);
    } catch {
      if (generation === this.generation) this.failed.set(true);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
