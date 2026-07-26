import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import {
  LOG_ENTRY_VISIBILITIES,
  LogEntryVisibility,
} from "../../../db/schemas/LogEntrySchema";
import type {
  SessionPersonReference,
  SessionRecordDocument,
} from "../../../db/schemas/SessionRecordSchema";
import { LogEntriesService } from "../../services/firebase/firestore/log-entries.service";
import { SessionRecordsService } from "../../services/firebase/firestore/session-records.service";
import { SpotPickerComponent } from "../spot-picker/spot-picker.component";
import { UserPickerComponent } from "../user-picker/user-picker.component";

@Component({
  selector: "app-log-entry-editor",
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    SpotPickerComponent,
    UserPickerComponent,
  ],
  templateUrl: "./log-entry-editor.component.html",
  styleUrl: "./log-entry-editor.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogEntryEditorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly logs = inject(LogEntriesService);
  private readonly sessionRecords = inject(SessionRecordsService);

  readonly entryId = this.route.snapshot.paramMap.get("entryId");
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal("");
  readonly sessions = signal<SessionRecordDocument[]>([]);
  readonly selectedIds = signal<string[]>([]);
  readonly showNewSession = signal(false);
  readonly spotIds = signal<string[]>([]);
  readonly people = signal<SessionPersonReference[]>([]);
  readonly selectedSessions = computed(() => {
    const selected = new Set(this.selectedIds());
    return this.sessions().filter((session) => selected.has(session.id));
  });
  readonly visibilities = LOG_ENTRY_VISIBILITIES;

  readonly form = new FormGroup({
    note: new FormControl("", { nonNullable: true }),
    visibility: new FormControl<LogEntryVisibility>("private", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly sessionForm = new FormGroup({
    startedAt: new FormControl(toLocalInput(new Date()), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    endedAt: new FormControl(toLocalInput(new Date()), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  constructor() {
    void this.load();
  }

  toggleSession(id: string, checked: boolean): void {
    this.selectedIds.update((ids) =>
      checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
    );
  }

  addPerson(uid: string): void {
    if (!uid || this.people().some((person) => person.uid === uid)) return;
    this.people.update((people) => [...people, { uid }]);
  }

  removePerson(uid: string): void {
    this.people.update((people) => people.filter((person) => person.uid !== uid));
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set("");
    try {
      let selected = this.selectedSessions();
      if (this.showNewSession()) {
        if (this.sessionForm.invalid) {
          this.sessionForm.markAllAsTouched();
          return;
        }
        const startedAt = new Date(this.sessionForm.controls.startedAt.value);
        const endedAt = new Date(this.sessionForm.controls.endedAt.value);
        if (endedAt.getTime() < startedAt.getTime()) {
          throw new Error($localize`:@@logEditor.invalidTimes:Leave time must be after arrival time.`);
        }
        const id = await this.sessionRecords.createManual({
          startedAt,
          endedAt,
          spotIds: this.spotIds(),
          peoplePresent: this.people(),
        });
        const created = await this.sessionRecords.getMine(id);
        if (created) selected = [...selected, created];
      }
      if (selected.length === 0) {
        this.showNewSession.set(true);
        this.error.set($localize`:@@logEditor.sessionRequired:Select a session record or add one below.`);
        return;
      }
      const input = {
        note: this.form.controls.note.value,
        visibility: this.form.controls.visibility.value,
        sessions: selected,
      };
      if (this.entryId) await this.logs.update(this.entryId, input);
      else await this.logs.create(input);
      await this.router.navigateByUrl("/train/log");
    } catch (error) {
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

  private async load(): Promise<void> {
    try {
      const sessions = await this.sessionRecords.listMine(100);
      this.sessions.set(sessions);
      if (this.entryId) {
        const entry = await this.logs.getMine(this.entryId);
        if (!entry) throw new Error($localize`:@@logEditor.notFound:Log entry not found.`);
        this.form.setValue({
          note: entry.note,
          visibility: entry.visibility,
        });
        this.selectedIds.set(entry.session_record_ids);
      } else if (sessions.length === 0) {
        this.showNewSession.set(true);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }
}

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
