import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatCardModule } from "@angular/material/card";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import type { LocaleCode } from "../../../db/models/Interfaces";
import type {
  SessionPersonReference,
  SessionRecordDocument,
} from "../../../db/schemas/SessionRecordSchema";
import { localDateKey, sessionMinutes } from "../../../db/utils/training-summary";
import { formatDuration } from "../../features/training-log-activity";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { StoreReviewService } from "../../reviews/store-review.service";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";
import { TrainingSummaryService } from "../../services/firebase/firestore/training-summary.service";
import { PlannedSessionsService } from "../../services/planned-sessions.service";
import { SpotSelectionDataService } from "../../services/spot-selection-data.service";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";
import { UserPickerComponent } from "../user-picker/user-picker.component";
import { matchingPlannedSessionRecords } from "./planned-session-records";

/** Quick duration choices in minutes; anything else uses the custom field. */
export const DURATION_PRESETS = [30, 60, 90, 120, 180] as const;
export type DurationChoice = number | "other" | null;
const MIN_MINUTES = 5;
const MAX_MINUTES = 12 * 60;

/**
 * Logs a training session without asking the person to pick database records.
 * Check-ins on the chosen day are linked automatically and can be unlinked;
 * otherwise saving creates a private manual session from the date, time and
 * optional Spots. Duration is the main input: it is optional, and without it
 * the session still counts as a visit.
 */
@Component({
  selector: "app-log-entry-editor",
  imports: [
    SystemDatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    SpotPickerComponent,
    UserPickerComponent,
  ],
  templateUrl: "./log-entry-editor.component.html",
  styleUrl: "./log-entry-editor.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogEntryEditorComponent {
  private readonly featureTelemetry = inject(FeatureTelemetryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reviews = inject(StoreReviewService);
  private readonly logs = inject(LogEntriesService);
  private readonly spotData = inject(SpotSelectionDataService);
  private readonly sessionRecords = inject(SessionRecordsService);
  private readonly summaries = inject(TrainingSummaryService);
  private readonly plannedSessions = inject(PlannedSessionsService);
  private readonly locale = inject(LOCALE_ID) as LocaleCode;
  private readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  readonly durationOptions = DURATION_PRESETS.map((minutes) => ({
    minutes,
    label: formatDuration(minutes),
  }));
  readonly entryId = this.route.snapshot.paramMap.get("entryId");
  readonly title = this.entryId
    ? $localize`:@@logEditor.editTitle:Edit log entry`
    : $localize`:@@logEditor.howWasIt:How was your training?`;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly spotNames = signal<ReadonlyMap<string, string>>(new Map());
  /** Recent sessions, used to find check-ins on the chosen day. */
  readonly sessions = signal<SessionRecordDocument[]>([]);
  /** Sessions this entry links to. Empty means "describe it manually". */
  readonly selectedIds = signal<string[]>([]);
  /** Check-ins the person said do not belong to this entry. */
  private readonly dismissedIds = signal<string[]>([]);
  /** The manual session being edited, when the entry describes one. */
  private readonly editingManualId = signal<string | null>(null);
  readonly spotIds = signal<string[]>([]);
  readonly people = signal<SessionPersonReference[]>([]);
  readonly durationChoice = signal<DurationChoice>(null);

  readonly form = new FormGroup({
    note: new FormControl("", { nonNullable: true }),
  });
  readonly detailsForm = new FormGroup({
    date: new FormControl(localDateKey(Date.now(), this.timeZone), { nonNullable: true }),
    time: new FormControl(currentTime(), { nonNullable: true }),
    customMinutes: new FormControl<number | null>(45),
  });

  readonly selectedSessions = computed(() => {
    const selected = new Set(this.selectedIds());
    return this.sessions().filter((session) => selected.has(session.id));
  });
  /** No linked session: the person describes when and where instead. */
  readonly showNewSession = computed(() => this.selectedSessions().length === 0);
  /** Duration applies to one session; several linked check-ins keep their own. */
  readonly durationEditable = computed(() => this.selectedSessions().length <= 1);
  readonly sessionPlaces = computed(() => new Map(this.sessions().map((session) => [
    session.id,
    session.spot_visits
      .map((visit) => visit.spot_name || this.spotNames().get(visit.spot_id) ||
        $localize`:@@training.loadingSpot:Loading Spot…`)
      .join(", "),
  ])));

  constructor() {
    void this.load();
  }

  setDuration(choice: DurationChoice): void {
    this.durationChoice.set(this.durationChoice() === choice ? null : choice);
  }

  /** Re-links check-ins whenever the person picks another day. */
  onDateChange(): void {
    if (this.entryId) return;
    this.linkCheckInsOn(this.detailsForm.controls.date.value);
  }

  unlink(sessionId: string): void {
    this.dismissedIds.update((ids) => [...new Set([...ids, sessionId])]);
    this.selectedIds.update((ids) => ids.filter((id) => id !== sessionId));
    const session = this.sessions().find((item) => item.id === sessionId);
    if (session && this.selectedIds().length === 0) {
      // Keep what the check-in already knew so the manual form starts close.
      this.spotIds.set([...new Set(session.spot_visits.map((visit) => visit.spot_id))]);
      this.detailsForm.patchValue({ time: timeOf(session.started_at_raw_ms) });
    }
  }

  addPerson(person: SessionPersonReference): void {
    if (!person.uid || this.people().some((item) => item.uid === person.uid)) return;
    this.people.update((people) => [
      ...people,
      {
        uid: person.uid,
        ...(person.display_name ? { display_name: person.display_name } : {}),
        ...(person.profile_picture ? { profile_picture: person.profile_picture } : {}),
      },
    ]);
  }

  removePerson(uid: string): void {
    this.people.update((people) => people.filter((person) => person.uid !== uid));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set("");
    try {
      const minutes = this.chosenMinutes();
      let selected = this.selectedSessions();
      if (selected.length === 0) {
        selected = [await this.saveManualSession(minutes)];
      } else if (minutes !== null && selected.length === 1) {
        selected = [await this.applyDuration(selected[0], minutes)];
      }
      const input = { note: this.form.controls.note.value, sessions: selected };
      if (this.entryId) await this.logs.update(this.entryId, input);
      else {
        await this.logs.create(input);
        this.reviews.recordActivity();
      }
      const navigated = await this.router.navigateByUrl("/train/log");
      if (navigated && !this.entryId) this.reviews.offerAfterCompletion();
    } catch (error) {
      this.featureTelemetry.failure("log-entry-editor", "save", error);
      console.error("[Training log] save failed", error);
      this.error.set(
        error instanceof Error
          ? error.message
          : $localize`:@@logEditor.saveError:Could not save this log entry.`,
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Minutes from the duration choice, null when none was given. */
  private chosenMinutes(): number | null {
    const choice = this.durationChoice();
    if (choice === null) return null;
    const minutes = choice === "other" ? Number(this.detailsForm.controls.customMinutes.value) : choice;
    if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      throw new Error($localize`:@@logEditor.invalidDuration:Enter a duration between 5 minutes and 12 hours.`);
    }
    return minutes;
  }

  private async saveManualSession(minutes: number | null): Promise<SessionRecordDocument> {
    const { date, time } = this.detailsForm.getRawValue();
    const startedAt = new Date(`${date}T${time || "00:00"}`);
    if (!Number.isFinite(startedAt.getTime())) {
      throw new Error($localize`:@@logEditor.invalidDate:Choose when you trained.`);
    }
    if (startedAt.getTime() > Date.now() + 60_000) {
      throw new Error($localize`:@@logEditor.futureDate:A training session can't start in the future.`);
    }
    const input = {
      startedAt,
      ...(minutes !== null ? { endedAt: new Date(startedAt.getTime() + minutes * 60_000) } : {}),
      timeZone: this.timeZone,
      spotIds: this.spotIds(),
      peoplePresent: this.people(),
    };
    const editing = this.editingManualId();
    const id = editing ?? (await this.sessionRecords.createManual(input));
    if (editing) await this.sessionRecords.update(editing, input);
    const saved = await this.sessionRecords.getMine(id);
    if (!saved) throw new Error($localize`:@@logEditor.saveError:Could not save this log entry.`);
    return saved;
  }

  private async applyDuration(
    session: SessionRecordDocument,
    minutes: number,
  ): Promise<SessionRecordDocument> {
    if (sessionMinutes(session) === minutes) return session;
    if (session.source === "check_in") {
      // Check-in sessions are server-owned; the server validates the duration.
      await this.summaries.setCheckInSessionDuration({ sessionRecordId: session.id, durationMinutes: minutes });
    } else {
      await this.sessionRecords.update(session.id, {
        startedAt: new Date(session.started_at_raw_ms),
        endedAt: new Date(session.started_at_raw_ms + minutes * 60_000),
        timeZone: session.time_zone || this.timeZone,
        spotIds: [...new Set(session.spot_visits.map((visit) => visit.spot_id))],
        peoplePresent: session.people_present ?? [],
      });
    }
    return (await this.sessionRecords.getMine(session.id)) ?? session;
  }

  private linkCheckInsOn(dateKey: string): void {
    const dismissed = new Set(this.dismissedIds());
    const matches = this.sessions()
      .filter((session) =>
        session.source === "check_in" &&
        !dismissed.has(session.id) &&
        session.spot_visits.some((visit) => !!visit.check_in_id) &&
        localDateKey(session.started_at_raw_ms, session.time_zone) === dateKey)
      .map((session) => session.id);
    this.selectedIds.set(matches);
    this.presetDuration();
  }

  /** Shows the duration a single linked session already has. */
  private presetDuration(): void {
    const [session] = this.selectedSessions();
    const minutes = this.selectedSessions().length === 1 && session ? sessionMinutes(session) : null;
    if (minutes === null) {
      this.durationChoice.set(null);
      return;
    }
    if ((DURATION_PRESETS as readonly number[]).includes(minutes)) {
      this.durationChoice.set(minutes);
    } else {
      this.durationChoice.set("other");
      this.detailsForm.controls.customMinutes.setValue(minutes);
    }
  }

  private loadManualSession(session: SessionRecordDocument): void {
    this.editingManualId.set(session.id);
    this.selectedIds.set([]);
    this.detailsForm.patchValue({
      date: localDateKey(session.started_at_raw_ms, session.time_zone),
      time: timeOf(session.started_at_raw_ms),
    });
    this.spotIds.set([...new Set(session.spot_visits.map((visit) => visit.spot_id))]);
    this.people.set([...(session.people_present ?? [])]);
    const minutes = sessionMinutes(session);
    if (minutes !== null) {
      this.durationChoice.set((DURATION_PRESETS as readonly number[]).includes(minutes) ? minutes : "other");
      this.detailsForm.controls.customMinutes.setValue(minutes);
    }
  }

  private async load(): Promise<void> {
    try {
      const sessions = await this.sessionRecords.listMine(100);
      this.sessions.set(sessions);
      const query = this.route.snapshot.queryParamMap;
      if (this.entryId) {
        const entry = await this.logs.getMine(this.entryId);
        if (!entry) throw new Error($localize`:@@logEditor.notFound:Log entry not found.`);
        this.form.setValue({ note: entry.note });
        const linked = await this.ensureSessions(entry.session_record_ids);
        const [only] = linked;
        if (linked.length === 1 && only.source !== "check_in") this.loadManualSession(only);
        else {
          this.selectedIds.set(linked.map((session) => session.id));
          this.presetDuration();
        }
      } else if (query.get("sessionRecord")) {
        // Always load through the owner-only service, including older records
        // outside the initial list. A URL never establishes ownership.
        const [record] = await this.ensureSessions([query.get("sessionRecord")!]);
        if (!record) throw new Error($localize`:@@logEditor.notFound:Log entry not found.`);
        this.selectedIds.set([record.id]);
        this.detailsForm.patchValue({ date: localDateKey(record.started_at_raw_ms, record.time_zone) });
        this.presetDuration();
      } else if (query.get("plannedSession")) {
        const { session } = await this.plannedSessions.get(query.get("plannedSession")!);
        // A plan is only a suggestion. No activity or check-in is created until
        // the person confirms what they actually did in this editor.
        this.selectedIds.set(matchingPlannedSessionRecords(sessions, session));
        if (this.selectedIds().length === 0) {
          this.spotIds.set([session.spotId]);
          if (session.startsAt < Date.now()) {
            this.detailsForm.patchValue({
              date: localDateKey(session.startsAt, this.timeZone),
              time: timeOf(session.startsAt),
            });
            this.durationChoice.set("other");
            this.detailsForm.controls.customMinutes.setValue(
              Math.round((Math.min(session.endsAt, Date.now()) - session.startsAt) / 60_000),
            );
          }
        }
      } else {
        this.linkCheckInsOn(this.detailsForm.controls.date.value);
      }
    } catch (error) {
      this.featureTelemetry.failure("log-entry-editor", "load", error);
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
      void this.spotData.resolveVisitNames(this.sessions().flatMap((session) => session.spot_visits), this.locale)
        .then((names) => this.spotNames.set(names));
    }
  }

  /** Loads linked sessions that are older than the recent list. */
  private async ensureSessions(ids: readonly string[]): Promise<SessionRecordDocument[]> {
    const known = new Map(this.sessions().map((session) => [session.id, session]));
    const missing = ids.filter((id) => !known.has(id));
    const loaded = await Promise.all(missing.map((id) => this.sessionRecords.getMine(id)));
    const found = loaded.filter((session): session is SessionRecordDocument => !!session);
    if (found.length) this.sessions.update((sessions) => [...sessions, ...found]);
    found.forEach((session) => known.set(session.id, session));
    return ids.map((id) => known.get(id)).filter((session): session is SessionRecordDocument => !!session);
  }
}

function currentTime(): string {
  return timeOf(Date.now());
}

function timeOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}
