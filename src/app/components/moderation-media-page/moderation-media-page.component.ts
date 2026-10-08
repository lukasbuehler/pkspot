import { inject as injectFeatureTelemetry } from "@angular/core";
import { FeatureTelemetryService } from "../../services/feature-telemetry.service";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import { combineLatest, Subscription } from "rxjs";
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
  private readonly featureTelemetry = injectFeatureTelemetry(FeatureTelemetryService);

  private readonly _mediaService = inject(ModerationMediaService);
  private readonly _snackbar = inject(MatSnackBar);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  readonly authService = inject(AuthenticationService);

  readonly authResolved = this.authService.initialAuthStateResolved;
  readonly isAdmin = signal(false);
  readonly isLoading = signal(false);
  readonly media = signal<ModerationMediaItem[]>([]);
  readonly reviewId = signal<string | null>(null);
  readonly previewUrls = signal<Record<string, string>>({});
  readonly previewLoadingId = signal<string | null>(null);
  readonly actionId = signal<string | null>(null);
  private readonly _authSubscription: Subscription;
  private loadVersion = 0;

  constructor() {
    this._authSubscription = combineLatest([
      this.authService.authState$,
      this._route.queryParamMap,
    ]).subscribe(([, params]) => {
      const isAdmin = this.authService.isAdmin();
      this.isAdmin.set(isAdmin);
      this.reviewId.set(params.get("review"));
      if (isAdmin) {
        void this.reload();
      } else {
        this.loadVersion++;
        this.media.set([]);
        this.previewUrls.set({});
        this.isLoading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.loadVersion++;
    this._authSubscription.unsubscribe();
  }

  async reload(): Promise<void> {
    if (!this.isAdmin()) {
      return;
    }

    const version = ++this.loadVersion;
    const reviewId = this.reviewId();
    this.isLoading.set(true);
    this.media.set([]);
    try {
      this.previewUrls.set({});
      const media = await (reviewId !== null
        ? this._mediaService.getReview(reviewId)
        : this._mediaService.getUploadStream());
      if (version === this.loadVersion) this.media.set(media);
    } catch (error) {
      if (version !== this.loadVersion) return;
      this.featureTelemetry.failure("moderation-media-page", "reload", error);
      console.error("Failed to load moderation media stream", error);
      this._snackbar.open($localize`Failed to load media stream`, undefined, {
        duration: 4000,
      });
    } finally {
      if (version === this.loadVersion) this.isLoading.set(false);
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
      this.featureTelemetry.failure("moderation-media-page", "reveal", error);
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

  async markFalsePositive(item: ModerationMediaItem): Promise<void> {
    if (!item.canMarkFalsePositive || !this.previewUrls()[item.id] || this.actionId() ||
        !globalThis.confirm($localize`Mark this flag as a false positive without publishing? The current profile picture and existing media will stay unchanged.`)) return;
    this.actionId.set(item.id);
    try {
      await this._mediaService.markFalsePositive(item.id);
      await this.reload();
      this._snackbar.open($localize`False positive recorded. No media was published or replaced.`, undefined, { duration: 5000 });
    } catch (error) {
      this.featureTelemetry.failure("moderation-media-page", "markFalsePositive", error);
      this._snackbar.open($localize`Failed to record the false positive`, undefined, { duration: 4000 });
    } finally {
      this.actionId.set(null);
    }
  }

  async openIncident(item: ModerationMediaItem): Promise<void> {
    if (!item.canEscalate || this.actionId()) return;
    if (!item.incidentPath && !globalThis.confirm(
      $localize`Escalate this media for incident assessment? Normal preview and release will be disabled. No external report is sent automatically.`,
    )) return;
    this.actionId.set(item.id);
    try {
      const path = item.incidentPath ?? await this._mediaService.createIncident(item.id);
      if (!/^safety_incidents\/[A-Za-z0-9_-]+$/.test(path)) throw new Error("Invalid incident path");
      this.hidePreview(item.id);
      await this.reload();
      await this._router.navigate(["/moderation/incidents", path.split("/")[1]]);
    } catch (error) {
      this.featureTelemetry.failure("moderation-media-page", "openIncident", error);
      this._snackbar.open($localize`Failed to open safety incident`, undefined, { duration: 4000 });
    } finally {
      this.actionId.set(null);
    }
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
      this.featureTelemetry.failure("moderation-media-page", "markSafe", error);
      console.error("Failed to release moderated media", error);
      this._snackbar.open($localize`Failed to release media`, undefined, {
        duration: 4000,
      });
    } finally {
      this.actionId.set(null);
    }
  }
}
