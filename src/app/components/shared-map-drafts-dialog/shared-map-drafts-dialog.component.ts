import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {NativeMapShareService, SharedMapDraft} from '../../services/native-map-share.service';

@Component({
  selector: 'app-shared-map-drafts-dialog',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './shared-map-drafts-dialog.component.html',
  styleUrl: './shared-map-drafts-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedMapDraftsDialogComponent {
  readonly shares = inject(NativeMapShareService);
  private readonly dialog = inject(MatDialogRef<SharedMapDraftsDialogComponent>);
  review(draft: SharedMapDraft, create = false): void {
    this.dialog.close();
    void this.shares.reviewDraft(draft, create);
  }
}
