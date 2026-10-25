import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-share-preparation',
  imports: [MatProgressSpinnerModule],
  templateUrl: './share-preparation.component.html',
  styleUrl: './share-preparation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharePreparationComponent {}
