import { ChangeDetectionStrategy, Component, Signal, computed, inject, signal } from "@angular/core";
import { MAT_DIALOG_DATA, MatDialogModule } from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

/** Lifecycle of the web share dialog. `fallback` means no card image is available. */
export type ShareCardDialogState =
  | { status: "preparing" }
  | { status: "ready"; imageUrl: string }
  | { status: "fallback" };

export interface ShareCardDialogData {
  title: string;
  state: Signal<ShareCardDialogState>;
  /** Resolves once the share attempt finished; the service closes the dialog on success. */
  share: () => Promise<void>;
  copy: () => Promise<void>;
}

/** Web result view for a prepared share card: preview image plus Share and Copy link. */
@Component({
  selector: "app-share-card-dialog",
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: "./share-card-dialog.component.html",
  styleUrl: "./share-card-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareCardDialogComponent {
  protected readonly data = inject<ShareCardDialogData>(MAT_DIALOG_DATA);
  protected readonly sharing = signal(false);
  /** Hidden again if the image fails to load, so the dialog degrades to title + actions. */
  protected readonly imageFailed = signal(false);
  protected readonly imageUrl = computed(() => {
    const state = this.data.state();
    return state.status === "ready" && !this.imageFailed() ? state.imageUrl : undefined;
  });

  protected async share(): Promise<void> {
    this.sharing.set(true);
    try { await this.data.share(); } finally { this.sharing.set(false); }
  }

  protected copy(): Promise<void> {
    return this.data.copy();
  }
}
