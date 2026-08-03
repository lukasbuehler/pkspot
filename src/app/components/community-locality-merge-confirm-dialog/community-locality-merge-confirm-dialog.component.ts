import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";
import { MatIconModule } from "@angular/material/icon";
import type { CommunityMergeLocalityOptionSchema } from "../../../db/schemas/CommunityMergeAdminSchema";

export interface CommunityLocalityMergeConfirmData {
  action: "merge" | "unmerge";
  locality: CommunityMergeLocalityOptionSchema;
  targetDisplayName: string;
}

@Component({
  selector: "app-community-locality-merge-confirm-dialog",
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
  ],
  templateUrl: "./community-locality-merge-confirm-dialog.component.html",
  styleUrl: "./community-locality-merge-confirm-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityLocalityMergeConfirmDialogComponent {
  readonly data = inject<CommunityLocalityMergeConfirmData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<
    MatDialogRef<CommunityLocalityMergeConfirmDialogComponent, boolean>
  >(MatDialogRef);

  confirm(): void {
    this.dialogRef.close(true);
  }
}
