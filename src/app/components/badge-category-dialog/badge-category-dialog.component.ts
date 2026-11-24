import { DecimalPipe, NgTemplateOutlet } from "@angular/common";
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButton } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatProgressBar } from "@angular/material/progress-bar";
import { BadgeCategoryProgress } from "../../shared/badge-definitions";

export interface BadgeCategoryDialogData {
  progress: BadgeCategoryProgress;
}

/**
 * Shows every level of one badge category: earned stickers in colour, missing
 * ones as silhouettes, and the progress towards the next level.
 */
@Component({
  selector: "app-badge-category-dialog",
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    MatButton,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatProgressBar,
  ],
  templateUrl: "./badge-category-dialog.component.html",
  styleUrl: "./badge-category-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeCategoryDialogComponent {
  readonly progress = inject<BadgeCategoryDialogData>(MAT_DIALOG_DATA).progress;

  /** The sticker shown large at the top: the highest earned level. */
  readonly current =
    this.progress.tiers.find((t) => t.tier === this.progress.earnedTier) ?? null;

  readonly remaining = this.progress.next
    ? Math.max(0, this.progress.next.requirement - (this.progress.value ?? 0))
    : 0;
}
