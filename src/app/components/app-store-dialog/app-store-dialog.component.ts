import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { AnalyticsService, type AppStoreTarget } from '../../services/analytics.service';
import { APP_LINKS } from '../../shared/app-links';

@Component({
  imports: [MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-app-store-dialog',
  styleUrl: './app-store-dialog.component.scss',
  templateUrl: './app-store-dialog.component.html',
})
export class AppStoreDialogComponent {
  private readonly analytics = inject(AnalyticsService);
  private readonly data = inject<{ surface?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  readonly appLinks = APP_LINKS;

  trackStoreClick(store: AppStoreTarget): void {
    this.analytics.trackAppStoreClick(this.data?.surface ?? 'unknown', store, 'store_choice_dialog');
  }
}
