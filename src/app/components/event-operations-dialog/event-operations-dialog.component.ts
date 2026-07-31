import { ChangeDetectionStrategy, Component, computed, inject, signal } from "@angular/core";
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
import type { Event as PkEvent } from "../../../db/models/Event";
import type {
  ApplyEventOperationalChangeRequest,
  EventOperationType,
} from "../../../db/schemas/EventLiveUpdateSchema";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";

export interface EventOperationsDialogData {
  event: PkEvent;
}

interface OperationOption {
  value: EventOperationType;
  label: string;
}

const dateTimeLocal = (date: Date): string => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

@Component({
  selector: "app-event-operations-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: "./event-operations-dialog.component.html",
  styleUrl: "./event-operations-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventOperationsDialogComponent {
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialogRef = inject<MatDialogRef<EventOperationsDialogComponent, boolean>>(
    MatDialogRef,
  );
  readonly data = inject<EventOperationsDialogData>(MAT_DIALOG_DATA);
  readonly event = this.data.event;
  readonly operation = signal<EventOperationType>(
    this.event.lifecycleStatus === "cancelled" ? "restore_event" : "cancel_event",
  );
  readonly reason = signal("");
  readonly note = signal("");
  readonly start = signal(dateTimeLocal(this.event.start));
  readonly end = signal(dateTimeLocal(this.event.end));
  readonly planId = signal(this.event.program?.active_plan_id ?? "");
  readonly itemId = signal("");
  readonly itemStatus = signal<"scheduled" | "cancelled" | "moved" | "delayed">("delayed");
  readonly previewing = signal(false);
  readonly saving = signal(false);

  readonly operationOptions = computed<OperationOption[]>(() =>
    this.event.lifecycleStatus === "cancelled"
      ? [{ value: "restore_event", label: $localize`Restore event` }]
      : [
          { value: "cancel_event", label: $localize`Cancel event` },
          { value: "reschedule_event", label: $localize`Reschedule event` },
          ...(this.event.program
            ? [
                { value: "update_program_item" as const, label: $localize`Update program item` },
                { value: "activate_program_plan" as const, label: $localize`Activate program plan` },
              ]
            : []),
        ],
  );
  readonly selectedPlan = computed(() =>
    this.event.program?.plans.find((plan) => plan.id === this.planId()),
  );
  readonly selectedItem = computed(() =>
    this.selectedPlan()?.items.find((item) => item.id === this.itemId()),
  );
  readonly canPreview = computed(() => {
    switch (this.operation()) {
      case "cancel_event":
        return this.reason().trim().length > 0;
      case "reschedule_event":
        return Boolean(this.start() && this.end() && new Date(this.end()) > new Date(this.start()));
      case "activate_program_plan":
        return Boolean(this.planId() && this.planId() !== this.event.program?.active_plan_id);
      case "update_program_item":
        return Boolean(this.planId() && this.itemId());
      case "restore_event":
        return true;
    }
  });
  readonly previewTitle = computed(() => {
    switch (this.operation()) {
      case "cancel_event": return $localize`Event cancelled`;
      case "restore_event": return $localize`Event restored`;
      case "reschedule_event": return $localize`Event rescheduled`;
      case "activate_program_plan": return $localize`Program plan changed`;
      case "update_program_item": return $localize`Program item updated`;
    }
  });
  readonly previewMessage = computed(() =>
    this.operation() === "cancel_event"
      ? this.reason().trim()
      : this.note().trim(),
  );

  operationChanged(operation: EventOperationType): void {
    this.operation.set(operation);
    if (operation === "update_program_item") {
      const plan = this.selectedPlan();
      const item = plan?.items[0];
      this.itemId.set(item?.id ?? "");
      if (item) {
        this.start.set(dateTimeLocal(item.runtimeOverride?.start ?? item.start));
        const end = item.runtimeOverride?.end ?? item.end;
        this.end.set(end ? dateTimeLocal(end) : "");
      }
    }
  }

  planChanged(planId: string): void {
    this.planId.set(planId);
    const item = this.event.program?.plans.find((plan) => plan.id === planId)?.items[0];
    this.itemId.set(item?.id ?? "");
  }

  itemChanged(itemId: string): void {
    this.itemId.set(itemId);
    const item = this.selectedItem();
    if (!item) return;
    this.start.set(dateTimeLocal(item.runtimeOverride?.start ?? item.start));
    const end = item.runtimeOverride?.end ?? item.end;
    this.end.set(end ? dateTimeLocal(end) : "");
  }

  showPreview(): void {
    if (this.canPreview()) this.previewing.set(true);
  }

  async apply(): Promise<void> {
    if (!this.canPreview() || this.saving()) return;
    this.saving.set(true);
    try {
      await this.liveUpdates.applyOperationalChange(this.buildRequest());
      this.snackbar.open($localize`Event operation applied.`, $localize`Dismiss`, {
        duration: 4000,
      });
      this.dialogRef.close(true);
    } catch (error) {
      console.error("Could not apply event operation", error);
      this.snackbar.open(
        error instanceof Error ? error.message : $localize`Could not apply the event operation.`,
        $localize`Dismiss`,
        { duration: 6000 },
      );
    } finally {
      this.saving.set(false);
    }
  }

  private buildRequest(): ApplyEventOperationalChangeRequest {
    const base = {
      eventId: this.event.id,
      ...(this.event.updatedAt ? { expectedUpdatedAtMs: this.event.updatedAt.getTime() } : {}),
      ...(this.note().trim() ? { note: this.note().trim() } : {}),
    };
    switch (this.operation()) {
      case "cancel_event":
        return { ...base, operation: "cancel_event", reason: this.reason().trim() };
      case "restore_event":
        return { ...base, operation: "restore_event" };
      case "reschedule_event":
        return {
          ...base,
          operation: "reschedule_event",
          start: new Date(this.start()).toISOString(),
          end: new Date(this.end()).toISOString(),
        };
      case "activate_program_plan":
        return { ...base, operation: "activate_program_plan", planId: this.planId() };
      case "update_program_item":
        return {
          ...base,
          operation: "update_program_item",
          planId: this.planId(),
          itemId: this.itemId(),
          status: this.itemStatus(),
          ...(this.start() ? { start: new Date(this.start()).toISOString() } : {}),
          ...(this.end() ? { end: new Date(this.end()).toISOString() } : {}),
        };
    }
  }
}
