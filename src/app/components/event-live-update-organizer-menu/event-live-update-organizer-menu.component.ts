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
  readonly editRequested = output<void>();
  readonly canPublish = signal(false);
  readonly showMenu = computed(() => this.canEdit() || this.canPublish());
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
}
