import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import type { LogEntryDocument } from "../../../db/schemas/LogEntrySchema";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";

@Component({
  selector: "app-public-training-log",
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./public-training-log.component.html",
  styleUrl: "./public-training-log.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicTrainingLogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly logsService = inject(LogEntriesService);
  readonly userId = this.route.snapshot.paramMap.get("userID") ?? "";
  readonly loading = signal(true);
  readonly logs = signal<LogEntryDocument[]>([]);

  constructor() {
    void this.logsService
      .listForOwner(this.userId)
      .then((logs) => this.logs.set(logs))
      .finally(() => this.loading.set(false));
  }
}
