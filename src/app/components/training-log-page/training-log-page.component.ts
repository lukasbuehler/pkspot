import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import type { LogEntryDocument } from "../../../db/schemas/LogEntrySchema";
import type { SessionRecordDocument } from "../../../db/schemas/SessionRecordSchema";
import type { CheckInHistoryItem } from "../../services/firebase/firestore/session-records.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";

@Component({
  selector: "app-training-log-page",
  imports: [SystemDatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./training-log-page.component.html",
  styleUrl: "./training-log-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingLogPageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly logsService = inject(LogEntriesService);
  private readonly sessionsService = inject(SessionRecordsService);

  readonly loading = signal(true);
  readonly logs = signal<LogEntryDocument[]>([]);
  readonly sessions = signal<SessionRecordDocument[]>([]);
  readonly checkIns = signal<CheckInHistoryItem[]>([]);
  readonly signedIn = signal(!!this.auth.user.uid);

  constructor() {
    this.auth.authState$.subscribe((user) => {
      this.signedIn.set(!!user?.uid);
      void this.load();
    });
  }

  async removeLog(id: string): Promise<void> {
    if (!confirm($localize`:@@trainingLog.deleteConfirm:Delete this log entry?`)) return;
    await this.logsService.delete(id);
    this.logs.update((logs) => logs.filter((log) => log.id !== id));
  }

  async removeCheckIn(checkIn: CheckInHistoryItem): Promise<void> {
    if (!confirm($localize`:@@trainingLog.checkIns.deleteConfirm:Delete this check-in from your private history?`)) return;
    await this.sessionsService.deleteCheckIn(checkIn.checkInId);
    await this.load();
  }

  async clearCheckIns(): Promise<void> {
    if (!confirm($localize`:@@trainingLog.checkIns.clearConfirm:Delete all check-ins from your private history? This cannot be undone.`)) return;
    await this.sessionsService.deleteAllCheckIns();
    await this.load();
  }

  async exportCheckIns(): Promise<void> {
    const exportJson = await this.sessionsService.exportCheckIns();
    const file = new Blob([exportJson], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pkspot-check-ins-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async load(): Promise<void> {
    if (!this.auth.user.uid) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    const [logs, sessions] = await Promise.all([
      this.logsService.listMine(),
      this.sessionsService.listMine(),
    ]);
    this.logs.set(logs);
    this.sessions.set(sessions);
    this.checkIns.set(
      sessions
        .flatMap((session) =>
          (session.spot_visits ?? []).flatMap((visit) =>
            visit.check_in_id
              ? [{
                  checkInId: visit.check_in_id,
                  sessionRecordId: session.id,
                  spotId: visit.spot_id,
                  ...(visit.spot_name ? { spotName: visit.spot_name } : {}),
                  arrivedAtRawMs: visit.arrived_at_raw_ms,
                }]
              : [],
          ),
        )
        .sort((first, second) => second.arrivedAtRawMs - first.arrivedAtRawMs),
    );
    this.loading.set(false);
  }
}
