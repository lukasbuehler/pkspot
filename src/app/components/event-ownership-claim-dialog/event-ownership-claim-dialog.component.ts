import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import type { FormerOwnerOutcome } from "../../../db/schemas/EventOwnershipClaimSchema";
import {
  OrganizationDocument,
  OrganizationsService,
} from "../../services/firebase/firestore/organizations.service";
import { EventOwnershipClaimsService } from "../../services/firebase/firestore/event-ownership-claims.service";

export interface EventOwnershipClaimDialogData {
  eventId: string;
  eventName: string;
}

@Component({
  selector: "app-event-ownership-claim-dialog",
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./event-ownership-claim-dialog.component.html",
  styleUrl: "./event-ownership-claim-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventOwnershipClaimDialogComponent {
  private readonly organizationsService = inject(OrganizationsService);
  private readonly claimsService = inject(EventOwnershipClaimsService);
  private readonly dialogRef = inject(MatDialogRef<EventOwnershipClaimDialogComponent>);
  readonly data = inject<EventOwnershipClaimDialogData>(MAT_DIALOG_DATA);

  readonly organizations = signal<OrganizationDocument[]>([]);
  readonly organizationId = signal("");
  readonly explanation = signal("");
  readonly evidence = signal("");
  readonly formerOwnerOutcome = signal<FormerOwnerOutcome>("retain_editor");
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal("");

  constructor() {
    void this.loadOrganizations();
  }

  private async loadOrganizations(): Promise<void> {
    try {
      this.organizations.set(
        await this.organizationsService.getManagerOrganizations(),
      );
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    const urls = this.evidence()
      .split(/\r?\n/u)
      .map((url) => url.trim())
      .filter(Boolean);
    if (!this.organizationId() || !this.explanation().trim() || urls.length === 0) {
      this.error.set($localize`Choose an organization, explain the claim, and add evidence.`);
      return;
    }
    this.submitting.set(true);
    this.error.set("");
    try {
      await this.claimsService.submit({
        eventId: this.data.eventId,
        organizationId: this.organizationId(),
        explanation: this.explanation().trim(),
        evidenceUrls: urls,
        suggestedFormerOwnerOutcome: this.formerOwnerOutcome(),
      });
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : $localize`Claim submission failed.`,
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
