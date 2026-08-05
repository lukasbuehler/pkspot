import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatRadioModule } from "@angular/material/radio";
import type {
  PreviewSpotDuplicateResolutionResponse,
  SpotDuplicateBlockerCode,
  SpotDuplicateCandidatePreview,
} from "../../../db/schemas/SpotDuplicateResolutionSchema";
import type { SpotReportSchema } from "../../../db/schemas/SpotReportSchema";
import {
  ModerationReportItem,
  ModerationReportsService,
} from "../../services/firebase/firestore/moderation-reports.service";
import {
  EntityReferenceAutocompleteComponent,
  EntityReferenceOption,
} from "../entity-reference-autocomplete/entity-reference-autocomplete.component";
import { SystemDatePipe } from "../../pipes/system-date.pipe";

export interface SpotDuplicateResolutionDialogData {
  report: ModerationReportItem;
}

@Component({
  selector: "app-spot-duplicate-resolution-dialog",
  imports: [
    EntityReferenceAutocompleteComponent,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    SystemDatePipe,
  ],
  templateUrl: "./spot-duplicate-resolution-dialog.component.html",
  styleUrl: "./spot-duplicate-resolution-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotDuplicateResolutionDialogComponent implements OnInit {
  private readonly _data = inject<SpotDuplicateResolutionDialogData>(MAT_DIALOG_DATA);
  private readonly _dialogRef = inject(MatDialogRef<SpotDuplicateResolutionDialogComponent>);
  private readonly _reports = inject(ModerationReportsService);

  readonly report = this._data.report;
  readonly candidateSpotId = signal(this._initialCandidateId());
  readonly previewData = signal<PreviewSpotDuplicateResolutionResponse | null>(null);
  readonly canonicalSpotId = signal("");
  readonly isLoading = signal(false);
  readonly isResolving = signal(false);
  readonly errorMessage = signal("");
  readonly excludedSpotIds = computed(() =>
    this.report.spotId ? [this.report.spotId] : [],
  );
  readonly canResolve = computed(() => {
    const preview = this.previewData();
    return Boolean(
      preview &&
      !this.isResolving() &&
      preview.eligibleCanonicalSpotIds.includes(this.canonicalSpotId()),
    );
  });

  ngOnInit(): void {
    if (this.candidateSpotId()) void this.loadPreview();
  }

  onCandidateSelection(selection: EntityReferenceOption | null): void {
    this.candidateSpotId.set(selection?.id ?? "");
    this.previewData.set(null);
    this.canonicalSpotId.set("");
    this.errorMessage.set("");
    if (selection) void this.loadPreview();
  }

  async loadPreview(): Promise<void> {
    const candidateSpotId = this.candidateSpotId();
    if (!candidateSpotId || this.isLoading()) return;
    this.isLoading.set(true);
    this.errorMessage.set("");
    try {
      const preview = await this._reports.previewSpotDuplicateResolution(
        this.report.path,
        candidateSpotId,
      );
      this.previewData.set(preview);
      this.canonicalSpotId.set("");
    } catch (error) {
      this.previewData.set(null);
      this.errorMessage.set(
        error instanceof Error ? error.message : $localize`Preview failed`,
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  selectCanonical(spotId: string): void {
    if (this.previewData()?.eligibleCanonicalSpotIds.includes(spotId)) {
      this.canonicalSpotId.set(spotId);
    }
  }

  async resolve(): Promise<void> {
    const preview = this.previewData();
    const canonicalSpotId = this.canonicalSpotId();
    if (!preview || !this.canResolve()) return;
    const redundantSpotId = preview.reported.id === canonicalSpotId
      ? preview.candidate.id
      : preview.reported.id;
    if (!globalThis.confirm(
      $localize`Delete the redundant Spot after the server repeats every safety check? This action is permanent and recorded in moderation provenance.`,
    )) return;
    this.isResolving.set(true);
    this.errorMessage.set("");
    try {
      const result = await this._reports.resolveSpotDuplicate({
        reportPath: this.report.path,
        canonicalSpotId,
        redundantSpotId,
        previewToken: preview.previewToken,
      });
      this._dialogRef.close(result);
    } catch (error) {
      this.errorMessage.set(
        error instanceof Error ? error.message : $localize`Resolution failed`,
      );
    } finally {
      this.isResolving.set(false);
    }
  }

  close(): void {
    this._dialogRef.close();
  }

  blockerLabel(blocker: SpotDuplicateBlockerCode): string {
    switch (blocker) {
      case "different_creator": return $localize`The Spots were created by different users.`;
      case "different_create_payload": return $localize`The initial CREATE payloads are different.`;
      case "outside_rapid_window": return $localize`The Spots were not created within ten seconds.`;
      case "too_many_edits": return $localize`The redundant Spot has too many edits for automatic resolution.`;
      case "unique_content": return $localize`The redundant Spot contains unique content.`;
      case "reviews": return $localize`The redundant Spot has reviews.`;
      case "challenges": return $localize`The redundant Spot has challenges.`;
      case "events": return $localize`The redundant Spot is used by events.`;
      case "check_ins": return $localize`The redundant Spot has check-ins.`;
      case "private_lists": return $localize`The redundant Spot is saved in private lists.`;
      case "home_spot": return $localize`The redundant Spot is a home Spot.`;
      case "organization_reference": return $localize`The redundant Spot is referenced by an organization.`;
      case "unrelated_reports": return $localize`The redundant Spot has unrelated reports.`;
      default: return $localize`Automatic resolution is blocked`;
    }
  }

  creatorLabel(candidate: SpotDuplicateCandidatePreview): string {
    return candidate.creatorUid || $localize`Unknown creator`;
  }

  private _initialCandidateId(): string {
    const raw = this.report.raw as SpotReportSchema;
    const duplicateOf: unknown = raw.duplicateOf;
    return typeof duplicateOf === "string"
      ? duplicateOf
      : typeof duplicateOf === "object" && duplicateOf !== null
        ? (duplicateOf as {id?: string}).id ?? ""
        : "";
  }
}
