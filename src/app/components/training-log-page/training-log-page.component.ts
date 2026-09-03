import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import {
  type LogEntryDocument,
  type LogEntryVisibility,
} from "../../../db/schemas/LogEntrySchema";
import type { SessionRecordDocument } from "../../../db/schemas/SessionRecordSchema";
import type { RecoveryPauseDocument } from "../../../db/schemas/RecoveryPauseSchema";
import type { CheckInHistoryItem } from "../../services/firebase/firestore/session-records.service";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  buildTrainingActivityDays,
  buildTrainingTimeline,
  dateKeyToMs,
  formatDuration,
  monthKey,
  summarizeTrainingMonth,
  type TrainingContributionSelection,
} from "../../features/training-log-activity";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { RecoveryPausesService } from "../../services/firebase/firestore/recovery-pauses.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";
import { TrainingActivityContributionGraphComponent } from "../training-activity-contribution-graph/training-activity-contribution-graph.component";
import {
  RecoveryPauseDialogComponent,
  type RecoveryPauseDialogData,
  type RecoveryPauseDialogResult,
} from "../recovery-pause-dialog/recovery-pause-dialog.component";

interface TrainingTimelineSession {
  kind: "training";
  id: string;
  entry: LogEntryDocument;
  durationMinutes: number;
  spotCount: number;
  sessionCount: number;
  includesCheckIn: boolean;
}

interface TrainingTimelineRecovery {
  kind: "recovery";
  id: string;
  pause: RecoveryPauseDocument;
  startedOnMs: number;
  endedOnMs?: number;
}

type TrainingTimelineItem = TrainingTimelineSession | TrainingTimelineRecovery;

interface TrainingTimelineGroup {
  key: string;
  dateMs: number;
  entries: readonly TrainingTimelineItem[];
}

@Component({
  selector: "app-training-log-page",
  imports: [
    SystemDatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    TrainingActivityContributionGraphComponent,
  ],
  templateUrl: "./training-log-page.component.html",
  styleUrl: "./training-log-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingLogPageComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly logsService = inject(LogEntriesService);
  private readonly recoveryPausesService = inject(RecoveryPausesService);
  private readonly sessionsService = inject(SessionRecordsService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly logs = signal<LogEntryDocument[]>([]);
  readonly recoveryPauses = signal<RecoveryPauseDocument[]>([]);
  readonly sessions = signal<SessionRecordDocument[]>([]);
  readonly checkIns = signal<CheckInHistoryItem[]>([]);
  readonly signedIn = signal(!!this.auth.user.uid);
  readonly selection = signal<TrainingContributionSelection | null>(null);
  readonly activityDays = computed(() => buildTrainingActivityDays(this.logs()));
  readonly monthSummary = computed(() =>
    summarizeTrainingMonth(this.activityDays(), monthKey(Date.now())),
  );
  readonly timeline = computed(() => {
    const sourceBySessionId = new Map(
      this.sessions().map((session) => [session.id, session.source]),
    );
    const selection = this.selection();
    const groups = new Map<string, TrainingTimelineItem[]>();
    if (selection?.kind !== "recovery-pause") {
      const selectedDay = selection?.kind === "training-day"
        ? selection.dayKey
        : null;
      for (const group of buildTrainingTimeline(this.logs(), selectedDay)) {
        groups.set(
          group.key,
          group.entries.map((entry): TrainingTimelineSession => ({
            kind: "training",
            id: entry.id,
            entry,
            durationMinutes: entry.session_summaries.reduce(
              (total, session) => total + (session.duration_minutes ?? 0),
              0,
            ),
            spotCount: entry.session_summaries.reduce(
              (total, session) => total + session.spot_count,
              0,
            ),
            sessionCount: entry.session_summaries.length,
            includesCheckIn: entry.session_record_ids.some(
              (id) => sourceBySessionId.get(id) === "check_in",
            ),
          })),
        );
      }
    }
    for (const pause of this.recoveryPauses()) {
      if (selection?.kind === "training-day") continue;
      if (
        selection?.kind === "recovery-pause" &&
        selection.recoveryPauseId !== pause.id
      ) {
        continue;
      }
      const entry: TrainingTimelineRecovery = {
        kind: "recovery",
        id: pause.id,
        pause,
        startedOnMs: dateKeyToMs(pause.started_on),
        ...(pause.ended_on ? { endedOnMs: dateKeyToMs(pause.ended_on) } : {}),
      };
      groups.set(pause.started_on, [...(groups.get(pause.started_on) ?? []), entry]);
    }
    return [...groups.entries()]
      .map(([key, entries]): TrainingTimelineGroup => ({
        key,
        dateMs: dateKeyToMs(key),
        entries,
      }))
      .sort((left, right) => right.key.localeCompare(left.key));
  });

  constructor() {
    this.auth.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
      this.signedIn.set(!!user?.uid);
      void this.load();
    });
  }

  clearHistorySelection(): void {
    this.selection.set(null);
  }

  openRecoveryDialog(pause?: RecoveryPauseDocument): void {
    this.dialog
      .open<
        RecoveryPauseDialogComponent,
        RecoveryPauseDialogData,
        RecoveryPauseDialogResult
      >(RecoveryPauseDialogComponent, {
        data: pause ? { pause } : {},
        width: "520px",
        maxWidth: "calc(100vw - 24px)",
        maxHeight: "calc(100dvh - 24px)",
        autoFocus: "dialog",
        restoreFocus: true,
      })
      .afterClosed()
      .subscribe((result) => {
        if (result?.changed) void this.load();
      });
  }

  durationLabel(minutes: number): string {
    return formatDuration(minutes);
  }

  visibilityLabel(visibility: LogEntryVisibility): string {
    switch (visibility) {
      case "friends":
        return $localize`:@@trainingLog.visibility.friends:Friends`;
      case "public":
        return $localize`:@@trainingLog.visibility.public:Public`;
      case "followers":
        return $localize`:@@trainingLog.visibility.followers:Followers`;
      default:
        return $localize`:@@trainingLog.visibility.private:Private`;
    }
  }

  recoveryReasonLabel(pause: RecoveryPauseDocument): string {
    switch (pause.reason) {
      case "illness":
        return $localize`:@@recoveryPause.reason.illness:Illness`;
      case "personal_break":
        return $localize`:@@recoveryPause.reason.personalBreak:Personal break`;
      case "other":
        return $localize`:@@recoveryPause.reason.other:Other`;
      default:
        return $localize`:@@recoveryPause.reason.injury:Injury`;
    }
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
    const [logs, sessions, recoveryPauses] = await Promise.all([
      this.logsService.listMine(),
      this.sessionsService.listMine(),
      this.recoveryPausesService.listMine(),
    ]);
    this.logs.set(logs);
    this.sessions.set(sessions);
    this.recoveryPauses.set(recoveryPauses);
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
