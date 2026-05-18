import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { SpotEditSummaryComponent } from "../spot-edit-summary/spot-edit-summary.component";
import { SpotEditsService } from "../../services/firebase/firestore/spot-edits.service";
import { OrganizationsService } from "../../services/firebase/firestore/organizations.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import { Spot } from "../../../db/models/Spot";
import { SpotEditSchema } from "../../../db/schemas/SpotEditSchema";
import { OrganizationSchema } from "../../../db/schemas/OrganizationSchema";
import { LOCALE_ID } from "@angular/core";
import { LocaleCode } from "../../../db/models/Interfaces";
import { SpotId } from "../../../db/schemas/SpotSchema";

type OrganizationDocument = OrganizationSchema & { id: string };
type ReviewItem = {
  edit: SpotEditSchema & { id: string };
  spotId: string;
  spot: Spot | null;
  organization: OrganizationDocument;
};

@Component({
  selector: "app-organization-review-inbox",
  imports: [MatButtonModule, MatCardModule, MatIconModule, SpotEditSummaryComponent],
  templateUrl: "./organization-review-inbox.component.html",
  styleUrl: "./organization-review-inbox.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationReviewInboxComponent {
  private _spotEditsService = inject(SpotEditsService);
  private _organizationsService = inject(OrganizationsService);
  private _spotsService = inject(SpotsService);
  private _locale = inject(LOCALE_ID) as LocaleCode;

  readonly items = signal<ReviewItem[]>([]);
  readonly loading = signal(true);
  readonly actionInFlight = signal<string | null>(null);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const organizations =
        await this._organizationsService.getReviewerOrganizations();
      const grouped = await Promise.all(
        organizations.map(async (organization) => {
          const edits =
            await this._spotEditsService.getPendingOrganizationReviewEdits(
              organization.id
            );
          return Promise.all(
            edits.map(async ({ edit, spotId }) => ({
              edit,
              spotId,
              organization,
              spot: await this._spotsService
                .getSpotById(spotId as SpotId, this._locale)
                .catch(() => null),
            }))
          );
        })
      );
      this.items.set(grouped.flat());
    } finally {
      this.loading.set(false);
    }
  }

  async decide(item: ReviewItem, decision: "approve" | "reject"): Promise<void> {
    const key = `${item.spotId}/${item.edit.id}`;
    this.actionInFlight.set(key);
    try {
      await this._spotEditsService.reviewVerifiedSpotEdit(
        item.spotId,
        item.edit.id,
        decision
      );
      await this.reload();
    } finally {
      this.actionInFlight.set(null);
    }
  }
}
