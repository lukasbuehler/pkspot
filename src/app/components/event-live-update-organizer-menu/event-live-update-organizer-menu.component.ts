import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import { MatMenuModule } from "@angular/material/menu";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Event as PkEvent } from "../../../db/models/Event";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { EventLiveUpdatesService } from "../../services/firebase/firestore/event-live-updates.service";
import { EventLiveUpdateDialogComponent } from "../event-live-update-dialog/event-live-update-dialog.component";
import { EventOperationsDialogComponent } from "../event-operations-dialog/event-operations-dialog.component";

@Component({
  selector: "app-event-live-update-organizer-menu",
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  templateUrl: "./event-live-update-organizer-menu.component.html",
  styleUrl: "./event-live-update-organizer-menu.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventLiveUpdateOrganizerMenuComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly liveUpdates = inject(EventLiveUpdatesService);
  private readonly dialog = inject(MatDialog);
  private authorizationRequest = 0;

  readonly event = input.required<PkEvent>();
  readonly canEdit = input(false);
  readonly canRequestOwnership = input(false);
  readonly editRequested = output<void>();
  readonly qrRequested = output<void>();
  readonly ownershipClaimRequested = output<void>();
  readonly operationApplied = output<void>();
  readonly canPublish = signal(false);
  readonly showMenu = computed(
    () =>
      this.canEdit() || this.canPublish() || this.canRequestOwnership(),
  );
  private readonly userId = signal(this.auth.user.uid ?? "");

  constructor() {
    this.auth.authState$
      .pipe(takeUntilDestroyed())
      .subscribe((user) => this.userId.set(user?.uid ?? ""));

    effect(() => {
      const event = this.event();
      const userId = this.userId();
      const request = ++this.authorizationRequest;
      this.canPublish.set(false);
      if (!userId || !event.organizer || !event.published) return;
      void this.liveUpdates.canCurrentUserPublish(event).then(
        (allowed) => {
          if (request === this.authorizationRequest) this.canPublish.set(allowed);
        },
        (error) => {
          if (request !== this.authorizationRequest) return;
          console.warn("Failed to check event organizer membership", error);
        },
      );
    });
  }

  openPublisher(): void {
    this.dialog.open(EventLiveUpdateDialogComponent, {
      data: { event: this.event() },
      width: "640px",
      maxWidth: "calc(100vw - 2rem)",
      maxHeight: "90vh",
      autoFocus: "first-tabbable",
    });
  }

  openOperations(): void {
    this.dialog
      .open<EventOperationsDialogComponent, { event: PkEvent }, boolean>(
        EventOperationsDialogComponent,
        {
          data: { event: this.event() },
          width: "860px",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "92vh",
          autoFocus: "first-tabbable",
        },
      )
      .afterClosed()
      .subscribe((applied) => {
        if (applied) this.operationApplied.emit();
      });
  }
}
