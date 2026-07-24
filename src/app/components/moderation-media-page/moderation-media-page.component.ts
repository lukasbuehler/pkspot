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
}
