import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { APP_LINKS } from '../../shared/app-links';

@Component({
  imports: [MatButtonModule, MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-app-store-dialog',
  styleUrl: './app-store-dialog.component.scss',
  templateUrl: './app-store-dialog.component.html',
})
export class AppStoreDialogComponent {
  readonly appLinks = APP_LINKS;
}
