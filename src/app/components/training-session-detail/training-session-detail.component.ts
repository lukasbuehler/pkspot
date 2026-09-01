import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import type { LocaleCode } from "../../../db/models/Interfaces";
import type { LogEntryDocument } from "../../../db/schemas/LogEntrySchema";
import type {
  SessionPersonReference,
  SessionRecordDocument,
} from "../../../db/schemas/SessionRecordSchema";
import { formatDuration } from "../../features/training-log-activity";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";
import { SpotSelectionDataService } from "../../services/spot-selection-data.service";

interface TrainingSpot {
  id: string;
  name: string;
  slug?: string;
  imageSrc?: string;
}

interface TrainingPartner extends SessionPersonReference {
  initials: string;
}

interface SessionDetailSummary {
  durationMinutes: number;
  spotCount: number;
  partnerCount: number;
  sessionCount: number;
}

@Component({
  selector: "app-training-session-detail",
  imports: [
    SystemDatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: "./training-session-detail.component.html",
  styleUrl: "./training-session-detail.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingSessionDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthenticationService);
  private readonly logs = inject(LogEntriesService);
  private readonly sessionRecords = inject(SessionRecordsService);
  private readonly spotData = inject(SpotSelectionDataService);
  private readonly locale = inject(LOCALE_ID) as LocaleCode;

  readonly entryId = this.route.snapshot.paramMap.get("entryId") ?? "";
  readonly loading = signal(true);
  readonly signedIn = signal(!!this.auth.user.uid);
  readonly entry = signal<LogEntryDocument | null>(null);
  readonly sessions = signal<SessionRecordDocument[]>([]);
  readonly spots = signal<TrainingSpot[]>([]);
  readonly error = signal("");
  readonly deleting = signal(false);
  readonly partners = computed(() => {
    const unique = new Map<string, SessionPersonReference>();
    for (const session of this.sessions()) {
      for (const person of session.people_present ?? []) {
        unique.set(person.uid, person);
      }
    }
    return [...unique.values()].map((person): TrainingPartner => ({
      ...person,
      initials: initials(person.display_name || person.uid),
    }));
  });
  readonly summary = computed<SessionDetailSummary>(() => {
    const entry = this.entry();
    const sessions = this.sessions();
    const loadedIds = new Set(sessions.map((session) => session.id));
    const loadedDuration = sessions.reduce(
      (total, session) => total + durationForSession(session),
      0,
    );
    const missingSummaries = (entry?.session_summaries ?? []).filter(
      (session) => !loadedIds.has(session.session_record_id),
    );
    const loadedSpotIds = new Set(
      sessions.flatMap((session) => session.spot_visits.map((visit) => visit.spot_id)),
    );
    const missingSpotCount = missingSummaries.reduce(
      (total, session) => total + session.spot_count,
      0,
    );
    return {
      durationMinutes:
        loadedDuration +
        missingSummaries.reduce(
          (total, session) => total + (session.duration_minutes ?? 0),
          0,
        ),
      spotCount: loadedSpotIds.size + missingSpotCount,
      partnerCount: this.partners().length,
      sessionCount: entry?.session_summaries.length ?? 0,
    };
  });

  constructor() {
    this.auth.authState$.pipe(takeUntilDestroyed()).subscribe((user) => {
      this.signedIn.set(!!user?.uid);
      if (user?.uid) void this.load();
      else this.loading.set(false);
    });
  }

  durationLabel(minutes: number): string {
    return formatDuration(minutes);
  }

  sessionDuration(session: SessionRecordDocument): string {
    return formatDuration(durationForSession(session));
  }

  sessionSourceLabel(session: SessionRecordDocument): string {
    return session.source === "check_in"
      ? $localize`:@@trainingSessionDetail.source.checkIn:Confirmed check-in`
      : $localize`:@@trainingSessionDetail.source.manual:Manual session`;
  }

  async deleteEntry(): Promise<void> {
    const entry = this.entry();
    if (!entry || !confirm($localize`:@@trainingSessionDetail.deleteConfirm:Delete this training session?`)) return;

    this.deleting.set(true);
    try {
      await this.logs.delete(entry.id);
      await this.router.navigateByUrl("/train/log");
    } finally {
      this.deleting.set(false);
    }
  }

  private async load(): Promise<void> {
    if (!this.entryId) {
      this.error.set($localize`:@@trainingSessionDetail.invalid:This training session could not be found.`);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set("");
    try {
      const entry = await this.logs.getMine(this.entryId);
      if (!entry) {
        this.error.set($localize`:@@trainingSessionDetail.notFound:This training session could not be found.`);
        return;
      }
      const sessions = (
        await Promise.all(
          entry.session_record_ids.map((id) => this.sessionRecords.getMine(id)),
        )
      ).filter((session): session is SessionRecordDocument => !!session);
      this.entry.set(entry);
      this.sessions.set(sessions);
      this.spots.set(await this.resolveSpots(sessions));
    } catch (error) {
      console.error("[Training session] failed to load", error);
      this.error.set(
        error instanceof Error
          ? error.message
          : $localize`:@@trainingSessionDetail.loadError:Your training session could not be loaded.`,
      );
    } finally {
      this.loading.set(false);
    }
  }

  private async resolveSpots(
    sessions: readonly SessionRecordDocument[],
  ): Promise<TrainingSpot[]> {
    const visitsById = new Map<string, { spot_name?: string }>();
    for (const session of sessions) {
      for (const visit of session.spot_visits) {
        if (!visitsById.has(visit.spot_id)) visitsById.set(visit.spot_id, visit);
      }
    }
    return Promise.all(
      [...visitsById.entries()].map(async ([id, visit]) => {
        if (visit.spot_name) return { id, name: visit.spot_name };
        try {
          const spot = await this.spotData.resolve(id, this.locale);
          return {
            id,
            name: spot.name(),
            ...(spot.slug ? { slug: spot.slug } : {}),
            ...(spot.previewImageSrc() ? { imageSrc: spot.previewImageSrc() } : {}),
          } satisfies TrainingSpot;
        } catch {
          return { id, name: visit.spot_name || id } satisfies TrainingSpot;
        }
      }),
    );
  }
}

function durationForSession(session: SessionRecordDocument): number {
  const end = session.ended_at_raw_ms ?? session.last_activity_raw_ms;
  return Math.max(0, Math.round((end - session.started_at_raw_ms) / 60_000));
}

function initials(value: string): string {
  return value
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
