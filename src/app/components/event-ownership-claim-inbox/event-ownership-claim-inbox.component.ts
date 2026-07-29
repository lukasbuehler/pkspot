import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { Event } from "../../../db/models/Event";
import type { EventId } from "../../../db/schemas/EventSchema";
import type { FormerOwnerOutcome } from "../../../db/schemas/EventOwnershipClaimSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  EventOwnershipClaimDocument,
  EventOwnershipClaimsService,
} from "../../services/firebase/firestore/event-ownership-claims.service";
import { EventsService } from "../../services/firebase/firestore/events.service";
import { EventCardComponent } from "../event-card/event-card.component";

interface ClaimDecisionDraft {
  transferOwnership: boolean;
  linkOrganizer: boolean;
  formerOwnerOutcome: FormerOwnerOutcome;
  reason: string;
}

@Component({
  selector: "app-event-ownership-claim-inbox",
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    EventCardComponent,
  ],
  templateUrl: "./event-ownership-claim-inbox.component.html",
  styleUrl: "./event-ownership-claim-inbox.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventOwnershipClaimInboxComponent {
  private readonly auth = inject(AuthenticationService);
  private readonly claimsService = inject(EventOwnershipClaimsService);
  private readonly eventsService = inject(EventsService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isAdmin = signal(false);
  readonly loading = signal(false);
  readonly claims = signal<EventOwnershipClaimDocument[]>([]);
  readonly events = signal<Record<string, Event>>({});
  readonly drafts = signal<Record<string, ClaimDecisionDraft>>({});
  readonly deciding = signal<string | null>(null);

  constructor() {
    effect(() => {
      const resolved = this.auth.initialAuthStateResolved();
      const admin = this.auth.user.data?.isAdmin === true;
      this.isAdmin.set(admin);
      if (resolved && admin && !this.loading()) void this.reload();
    });
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const claims = await this.claimsService.listPending();
      const loadedEvents = await Promise.all(
        claims.map((claim) =>
          this.eventsService.getEventById(claim.event_id as EventId),
        ),
      );
      this.claims.set(claims);
      this.events.set(
        Object.fromEntries(
          loadedEvents
            .filter((event): event is Event => !!event)
            .map((event) => [String(event.id), event]),
        ),
      );
      this.drafts.set(
        Object.fromEntries(
          claims.map((claim) => [
            claim.id,
            {
              transferOwnership: true,
              linkOrganizer:
                claim.organizer_before?.organization.id !==
                claim.organization_id,
              formerOwnerOutcome: claim.suggested_former_owner_outcome,
              reason: "",
            },
          ]),
        ),
      );
    } catch {
      this.snackBar.open($localize`Could not load ownership claims.`);
    } finally {
      this.loading.set(false);
    }
  }

  updateDraft(
    claimId: string,
    patch: Partial<ClaimDecisionDraft>,
  ): void {
    this.drafts.update((drafts) => ({
      ...drafts,
      [claimId]: { ...drafts[claimId], ...patch },
    }));
  }

  async decide(claim: EventOwnershipClaimDocument, approve: boolean): Promise<void> {
    const draft = this.drafts()[claim.id];
    if (!draft || (!approve && !draft.reason.trim())) {
      this.snackBar.open($localize`Enter a rejection reason.`);
      return;
    }
    this.deciding.set(claim.id);
    try {
      await this.claimsService.review({
        claimId: claim.id,
        approve,
        transferOwnership: draft.transferOwnership,
        linkOrganizer: draft.linkOrganizer,
        formerOwnerOutcome: draft.formerOwnerOutcome,
        reason: draft.reason.trim() || undefined,
      });
      await this.reload();
      this.snackBar.open(
        approve
          ? $localize`Ownership claim approved.`
          : $localize`Ownership claim rejected.`,
      );
    } catch (error) {
      this.snackBar.open(
        error instanceof Error ? error.message : $localize`Decision failed.`,
      );
    } finally {
      this.deciding.set(null);
    }
  }

  ownerResponseLabel(position: "support" | "contest"): string {
    return position === "support"
      ? $localize`:@@event_claims.response_support_label:Supported`
      : $localize`:@@event_claims.response_contest_label:Contested`;
  }
}
