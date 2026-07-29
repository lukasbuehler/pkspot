import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { Event } from "../../../db/models/Event";
import type { EventId } from "../../../db/schemas/EventSchema";
import {
  EventOwnershipClaimDocument,
  EventOwnershipClaimsService,
} from "../../services/firebase/firestore/event-ownership-claims.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { EventCardComponent } from "../event-card/event-card.component";

@Component({
  selector: "app-event-ownership-claim-response",
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    EventCardComponent,
  ],
  templateUrl: "./event-ownership-claim-response.component.html",
  styleUrl: "./event-ownership-claim-response.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventOwnershipClaimResponseComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly claimsService = inject(EventOwnershipClaimsService);
  private readonly eventsService = inject(EventsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly loading = signal(true);
  readonly submitting = signal<"support" | "contest" | null>(null);
  readonly claim = signal<EventOwnershipClaimDocument | null>(null);
  readonly event = signal<Event | null>(null);
  readonly message = signal("");
  readonly inaccessible = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const claimId = this.route.snapshot.paramMap.get("claimId");
    if (!claimId) {
      this.inaccessible.set(true);
      this.loading.set(false);
      return;
    }
    try {
      const claim = await this.claimsService.getById(claimId);
      this.claim.set(claim);
      if (claim) {
        this.event.set(
          await this.eventsService.getEventById(claim.event_id as EventId),
        );
        this.message.set(claim.owner_response?.message ?? "");
      } else {
        this.inaccessible.set(true);
      }
    } catch {
      this.inaccessible.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async respond(position: "support" | "contest"): Promise<void> {
    const claim = this.claim();
    if (!claim || claim.status !== "pending") return;
    this.submitting.set(position);
    try {
      await this.claimsService.respond({
        claimId: claim.id,
        position,
        message: this.message().trim() || undefined,
      });
      await this.load();
      this.snackBar.open(
        position === "support"
          ? $localize`:@@event_claims.response_supported:Your support was recorded.`
          : $localize`:@@event_claims.response_contested:Your objection was recorded.`,
      );
    } catch (error) {
      this.snackBar.open(
        error instanceof Error
          ? error.message
          : $localize`:@@event_claims.response_failed:Could not save your response.`,
      );
    } finally {
      this.submitting.set(null);
    }
  }

  statusLabel(status: "approved" | "rejected"): string {
    return status === "approved"
      ? $localize`:@@event_claims.status_approved:Claim approved`
      : $localize`:@@event_claims.status_rejected:Claim rejected`;
  }
}
