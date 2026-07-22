import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { FormField, form, maxLength, required, submit } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Event as PkEvent } from "../../../db/models/Event";
import {
  EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH,
  EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH,
  type EventLiveUpdateType,
} from "../../../db/schemas/EventLiveUpdateSchema";
import { AnalyticsService } from "../../services/analytics.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import {
  EventSpotSelection,
  EventSpotSelectComponent,
} from "../event-spot-select/event-spot-select.component";

export interface EventLiveUpdateDialogData {
  event: PkEvent;
}

interface UpdateTypeOption {
  type: EventLiveUpdateType;
  label: string;
  defaultTitle: string;
}

const UPDATE_TYPE_OPTIONS: readonly UpdateTypeOption[] = [
  {
    type: "meet_up_time",
    label: $localize`Meet-up time`,
    defaultTitle: $localize`Meet-up time updated`,
  },
  {
    type: "location_spot_change",
    label: $localize`Location/Spot change`,
    defaultTitle: $localize`Meet-up location changed`,
  },
  {
    type: "schedule_change",
    label: $localize`Schedule change`,
    defaultTitle: $localize`Schedule updated`,
  },
  {
    type: "weather_update",
    label: $localize`Weather update`,
    defaultTitle: $localize`Weather update`,
  },
  {
    type: "session_starting_soon",
    label: $localize`Session starting soon`,
    defaultTitle: $localize`Session starting soon`,
  },
  {
    type: "general_update",
    label: $localize`General event update`,
    defaultTitle: $localize`Event update`,
  },
];

@Component({
  selector: "app-event-live-update-dialog",
  imports: [
    FormField,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    EventSpotSelectComponent,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: "./event-live-update-dialog.component.html",
  styleUrl: "./event-live-update-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLiveUpdateDialogComponent {
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly analytics = inject(AnalyticsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogRef = inject<MatDialogRef<EventLiveUpdateDialogComponent, boolean>>(
    MatDialogRef,
  );
  readonly data = inject<EventLiveUpdateDialogData>(MAT_DIALOG_DATA);

  readonly event = this.data.event;
  readonly updateTypeOptions = UPDATE_TYPE_OPTIONS;
  readonly titleMaxLength = EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH;
  readonly messageMaxLength = EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH;
  readonly previewing = signal(false);
  readonly publishing = signal(false);
  readonly formModel = signal({
    type: "general_update" as EventLiveUpdateType,
    title: UPDATE_TYPE_OPTIONS.at(-1)?.defaultTitle ?? "Event update",
    message: "",
    scheduledFor: "",
    eventSpotId: "",
  });
  readonly updateForm = form(this.formModel, (fields) => {
    required(fields.type);
    required(fields.title, { message: $localize`Add a short title.` });
    maxLength(fields.title, EVENT_LIVE_UPDATE_TITLE_MAX_LENGTH);
    maxLength(fields.message, EVENT_LIVE_UPDATE_MESSAGE_MAX_LENGTH);
  });
  updateTypeChanged(type: EventLiveUpdateType): void {
    const option = UPDATE_TYPE_OPTIONS.find((candidate) => candidate.type === type);
    if (!option) return;
    this.formModel.update((model) => ({
      ...model,
      type,
      title: option.defaultTitle,
    }));
  }

  eventSpotChanged(selection: EventSpotSelection | null): void {
    this.formModel.update((model) => ({
      ...model,
      eventSpotId: selection?.id ?? "",
    }));
  }

  showPreview(): void {
    submit(this.updateForm, async () => this.previewing.set(true));
  }

  updateTypeLabel(type: EventLiveUpdateType): string {
    return UPDATE_TYPE_OPTIONS.find((option) => option.type === type)?.label ?? type;
  }

  async publishUpdate(): Promise<void> {
    if (this.publishing()) return;
    this.publishing.set(true);
    const model = this.formModel();
    try {
      await this.liveUpdates.publish({
        eventId: this.event.id,
        type: model.type,
        title: model.title,
        ...(model.message.trim() ? { message: model.message.trim() } : {}),
        ...(model.scheduledFor
          ? { scheduledFor: new Date(model.scheduledFor).toISOString() }
          : {}),
        ...(model.eventSpotId ? { eventSpotId: model.eventSpotId } : {}),
      });
      this.analytics.trackEvent("live_update_published", {
        event_id: this.event.id,
        update_type: model.type,
      });
      this.snackbar.open($localize`Live update published.`, $localize`Dismiss`, {
        duration: 4000,
      });
      this.dialogRef.close(true);
    } catch (error) {
      console.error("Could not publish event live update", error);
      this.snackbar.open(
        error instanceof Error
          ? error.message
          : $localize`Could not publish the live update.`,
        $localize`Dismiss`,
        { duration: 6000 },
      );
    } finally {
      this.publishing.set(false);
    }
  }
}
