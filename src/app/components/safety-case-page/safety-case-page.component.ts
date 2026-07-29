import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormField, form, maxLength, minLength, required, submit } from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { SafetyCasePublicView } from "../../../db/schemas/SafetyCaseSchema";
import {
  SafetyCasesService,
  type SubmitSafetyCaseResult,
} from "../../services/safety-cases.service";

@Component({
  selector: "app-safety-case-page",
  imports: [
    DatePipe,
    FormField,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RouterLink,
  ],
  templateUrl: "./safety-case-page.component.html",
  styleUrl: "./safety-case-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyCasePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly safetyCases = inject(SafetyCasesService);
  private readonly snackbar = inject(MatSnackBar);

  readonly publicReference =
    this.route.snapshot.paramMap.get("publicReference") ?? "";
  readonly submission = signal(
    (globalThis.history?.state?.["submission"] as SubmitSafetyCaseResult | undefined) ??
      null,
  );
  readonly safetyCase = signal<SafetyCasePublicView | null>(null);
  readonly loading = signal(true);
  readonly accessDenied = signal(false);
  readonly sending = signal(false);
  readonly appealing = signal(false);
  readonly messageModel = signal({ message: "" });
  readonly messageForm = form(this.messageModel, (fields) => {
    required(fields.message);
    minLength(fields.message, 2);
    maxLength(fields.message, 3000);
  });
  readonly appealModel = signal({ reason: "" });
  readonly appealForm = form(this.appealModel, (fields) => {
    required(fields.reason);
    minLength(fields.reason, 10);
    maxLength(fields.reason, 5000);
  });
  readonly targetDate = computed(
    () =>
      this.safetyCase()?.target_resolution_at ??
      this.submission()?.target_resolution_at,
  );
  readonly complexDate = computed(
    () =>
      this.safetyCase()?.complex_resolution_at ??
      this.submission()?.complex_resolution_at,
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.accessDenied.set(false);
    try {
      const accessToken = this.route.snapshot.queryParamMap.get("access");
      const value = accessToken
        ? await this.safetyCases.exchangeAccessLink(accessToken)
        : await this.safetyCases.get(this.publicReference);
      this.safetyCase.set(value);
      if (accessToken) {
        await this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true,
        });
      }
    } catch (error) {
      console.warn("Could not load safety case", error);
      this.accessDenied.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  addMessage(): void {
    submit(this.messageForm, async () => {
      if (this.sending()) return;
      this.sending.set(true);
      try {
        await this.safetyCases.addMessage(
          this.publicReference,
          this.messageModel().message.trim(),
        );
        this.messageModel.set({ message: "" });
        await this.load();
        this.snackbar.open($localize`Your update was added.`, $localize`Dismiss`, {
          duration: 4000,
        });
      } catch (error) {
        this.showError(error, $localize`Could not add your update.`);
      } finally {
        this.sending.set(false);
      }
    });
  }

  submitAppeal(): void {
    submit(this.appealForm, async () => {
      if (this.appealing()) return;
      this.appealing.set(true);
      try {
        const result = await this.safetyCases.appeal(
          this.publicReference,
          this.appealModel().reason.trim(),
        );
        await this.router.navigate([
          "/safety/cases",
          result.public_reference,
        ]);
      } catch (error) {
        this.showError(error, $localize`Could not submit the appeal.`);
      } finally {
        this.appealing.set(false);
      }
    });
  }

  private showError(error: unknown, fallback: string): void {
    console.error(fallback, error);
    this.snackbar.open(
      error instanceof Error ? error.message : fallback,
      $localize`Dismiss`,
      { duration: 7000 },
    );
  }
}
