import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { Subscription } from "rxjs";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import {
  ModerationMediaItem,
  ModerationMediaService,
} from "../../services/firebase/firestore/moderation-media.service";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

@Component({
  selector: "app-moderation-media-page",
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    SystemDatePipe,
    ProfileButtonComponent,
    SpotPreviewCardComponent,
  ],
  templateUrl: "./moderation-media-page.component.html",
  styleUrl: "./moderation-media-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationMediaPageComponent implements OnDestroy {
  private readonly _mediaService = inject(ModerationMediaService);
  private readonly _snackbar = inject(MatSnackBar);
  readonly authService = inject(AuthenticationService);

  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly isLoading = signal(false);
  readonly media = signal<ModerationMediaItem[]>([]);
  readonly previewUrls = signal<Record<string, string>>({});
  readonly previewLoadingId = signal<string | null>(null);
  readonly actionId = signal<string | null>(null);
  private readonly _authSubscription: Subscription;

  constructor() {
    this._authSubscription = this.authService.authState$.subscribe(() => {
      const isAdmin = this.authService.isAdmin();
      this.isAdmin.set(isAdmin);
      if (isAdmin) {
        void this.reload();
      }
    });
  }

  ngOnDestroy(): void {
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    if (!this.isAdmin() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    try {
      this.previewUrls.set({});
      this.media.set(await this._mediaService.getUploadStream());
    } catch (error) {
      console.error("Failed to load moderation media stream", error);
      this._snackbar.open($localize`Failed to load media stream`, undefined, {
        duration: 4000,
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  async reveal(item: ModerationMediaItem): Promise<void> {
    if (
      !item.canReveal ||
      this.previewLoadingId() ||
      this.previewUrls()[item.id] ||
      !globalThis.confirm(
        $localize`This upload was flagged or failed automated scanning and may be disturbing. Reveal it for manual moderation?`,
      )
    ) {
      return;
    }

    this.previewLoadingId.set(item.id);
    try {
      const url = await this._mediaService.getQuarantinedPreview(item.id);
      this.previewUrls.update((urls) => ({ ...urls, [item.id]: url }));
    } catch (error) {
      console.error("Failed to load quarantined media", error);
      this._snackbar.open($localize`Failed to load quarantined media`, undefined, {
        duration: 4000,
      });
    } finally {
      this.previewLoadingId.set(null);
    }
  }

  hidePreview(reviewId: string): void {
    this.previewUrls.update((urls) =>
      Object.fromEntries(
        Object.entries(urls).filter(([id]) => id !== reviewId),
      ),
    );
  }

  async markSafe(item: ModerationMediaItem): Promise<void> {
    if (
      !item.canMarkSafe ||
      !this.previewUrls()[item.id] ||
      this.actionId() ||
      !globalThis.confirm(
        $localize`Mark this media as safe and release it publicly? This records your administrator decision.`,
      )
    ) {
      return;
    }

    this.actionId.set(item.id);
    try {
      await this._mediaService.markSafe(item.id);
      await this.reload();
      this._snackbar.open($localize`Media marked safe and released`, undefined, {
        duration: 3000,
      });
    } catch (error) {
      console.error("Failed to release moderated media", error);
      this._snackbar.open($localize`Failed to release media`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionId.set(null);
    }
  }
}
