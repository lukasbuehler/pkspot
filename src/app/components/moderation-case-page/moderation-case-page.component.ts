import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { SystemDatePipe } from "../../pipes/system-date.pipe";
import { ActivatedRoute, RouterLink } from "@angular/router";
import {
  FormField,
  form,
  maxLength,
  minLength,
  required,
  submit,
} from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatChipsModule } from "@angular/material/chips";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import type { Spot } from "../../../db/models/Spot";
import type { SpotId } from "../../../db/schemas/SpotSchema";
import type {
  SafetyCaseDecisionType,
  SafetyCaseOutcome,
  SafetyCaseStatus,
} from "../../../db/schemas/SafetyCaseSchema";
import type { UserReferenceSchema } from "../../../db/schemas/UserSchema";
import { AuthenticationService } from "../../services/firebase/authentication.service";
import { SpotsService } from "../../services/firebase/firestore/spots.service";
import {
  SafetyCasesService,
  type AdminSafetyCaseDetail,
} from "../../services/safety-cases.service";
import { ProfileButtonComponent } from "../profile-button/profile-button.component";
import { SpotPreviewCardComponent } from "../spot-preview-card/spot-preview-card.component";

@Component({
  selector: "app-moderation-case-page",
  imports: [
    SystemDatePipe,
    FormField,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ProfileButtonComponent,
    RouterLink,
    SpotPreviewCardComponent,
  ],
  templateUrl: "./moderation-case-page.component.html",
  styleUrl: "./moderation-case-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationCasePageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly safetyCases = inject(SafetyCasesService);
  private readonly spots = inject(SpotsService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly locale = inject(LOCALE_ID);
  readonly auth = inject(AuthenticationService);

  readonly publicReference =
    this.route.snapshot.paramMap.get("publicReference") ?? "";
  readonly loading = signal(true);
  readonly working = signal(false);
  readonly detail = signal<AdminSafetyCaseDetail | null>(null);
  readonly spot = signal<Spot | null>(null);
  readonly statusOptions: readonly SafetyCaseStatus[] = [
    "received",
    "triaged",
    "under_review",
    "awaiting_information",
    "resolved",
    "closed",
  ];
  readonly decisionTypeOptions: readonly SafetyCaseDecisionType[] = [
    "close_without_action",
    "publish_warning",
    "restrict_media",
    "unpublish_spot",
    "restrict_profile",
    "restrict_account",
    "confirm_automated_media_decision",
    "release_automated_media",
    "confirm_age_assurance_decision",
    "request_age_assurance_retry",
  ];
  readonly outcomeOptions: readonly SafetyCaseOutcome[] = [
    "action_taken",
    "no_action",
    "partially_upheld",
    "upheld",
    "reversed",
    "retry_required",
    "superseded",
  ];
  readonly updateModel = signal({
    status: "under_review" as SafetyCaseStatus,
    participantRole: "submitter" as "submitter" | "subject",
    message: "",
    internalNote: "",
  });
  readonly updateForm = form(this.updateModel, (fields) => {
    required(fields.status);
    required(fields.participantRole);
    maxLength(fields.message, 4000);
    maxLength(fields.internalNote, 4000);
  });
  readonly decisionModel = signal({
    decisionType: "close_without_action" as SafetyCaseDecisionType,
    outcome: "no_action" as SafetyCaseOutcome,
    publicReason: "",
    policyBasis: "",
    internalNote: "",
    independenceLimitation: "",
  });
  readonly decisionForm = form(this.decisionModel, (fields) => {
    required(fields.decisionType);
    required(fields.outcome);
    required(fields.publicReason);
    minLength(fields.publicReason, 10);
    maxLength(fields.publicReason, 2000);
    maxLength(fields.policyBasis, 500);
    maxLength(fields.internalNote, 4000);
    maxLength(fields.independenceLimitation, 1000);
  });
  readonly reporter = computed<UserReferenceSchema | null>(() => {
    const intake = this.detail()?.private_intake;
    const uid = intake?.submitter_uid;
    if (!uid) return null;
    return {
      uid,
      ...(intake.reporter_display_name
        ? { display_name: intake.reporter_display_name }
        : {}),
      ...(intake.reporter_profile_picture
        ? { profile_picture: intake.reporter_profile_picture }
        : {}),
    };
  });
  readonly targetLink = computed(() => {
    const subject = this.detail()?.case.subject;
    if (!subject?.path) return null;
    if (/^spots\/[^/]+$/u.test(subject.path)) {
      return `/map/spots/${subject.path.replace("spots/", "")}`;
    }
    if (subject.type === "profile" && subject.owner_uid) {
      return `/u/${subject.owner_uid}`;
    }
    return null;
  });

  constructor() {
    effect(() => {
      if (this.auth.authorizationStateResolved()) {
        if (this.auth.isAdmin()) {
          void this.load();
        } else {
          this.loading.set(false);
        }
      }
    });
  }

  async load(): Promise<void> {
    if (!this.auth.isAdmin() && this.auth.authorizationStateResolved()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const detail = await this.safetyCases.getAdminCase(this.publicReference);
      this.detail.set(detail);
      this.updateModel.update((value) => ({
        ...value,
        status: detail.workflow.status,
      }));
      await this.loadSpot(detail);
    } catch (error) {
      this.showError(error, $localize`Could not load this safety case.`);
    } finally {
      this.loading.set(false);
    }
  }

  saveUpdate(): void {
    submit(this.updateForm, async () => {
      if (this.working()) return;
      this.working.set(true);
      const value = this.updateModel();
      try {
        await this.safetyCases.updateAdminCase(this.publicReference, {
          status: value.status,
          assign_to_self: true,
          participant_role: value.participantRole,
          ...(value.message.trim() ? { message: value.message.trim() } : {}),
          ...(value.internalNote.trim()
            ? { internal_note: value.internalNote.trim() }
            : {}),
        });
        this.updateModel.update((current) => ({
          ...current,
          message: "",
          internalNote: "",
        }));
        await this.load();
        this.snackbar.open($localize`Case updated.`, undefined, {
          duration: 4000,
        });
      } catch (error) {
        this.showError(error, $localize`Could not update this case.`);
      } finally {
        this.working.set(false);
      }
    });
  }

  recordDecision(): void {
    submit(this.decisionForm, async () => {
      if (this.working()) return;
      const value = this.decisionModel();
      if (
        !globalThis.confirm(
          $localize`Record this decision and apply its moderation action?`,
        )
      ) {
        return;
      }
      this.working.set(true);
      try {
        await this.safetyCases.decideAdminCase(this.publicReference, {
          decision_type: value.decisionType,
          outcome: value.outcome,
          public_reason: value.publicReason.trim(),
          ...(value.policyBasis.trim()
            ? { policy_basis: value.policyBasis.trim() }
            : {}),
          ...(value.internalNote.trim()
            ? { internal_note: value.internalNote.trim() }
            : {}),
          ...(value.independenceLimitation.trim()
            ? {
                independence_limitation:
                  value.independenceLimitation.trim(),
              }
            : {}),
        });
        await this.load();
        this.snackbar.open($localize`Decision recorded.`, undefined, {
          duration: 5000,
        });
      } catch (error) {
        this.showError(error, $localize`Could not record this decision.`);
      } finally {
        this.working.set(false);
      }
    });
  }

  async restoreDecision(): Promise<void> {
    if (this.working()) return;
    if (
      !globalThis.confirm(
        $localize`Restore the content or account state held by this decision?`,
      )
    ) {
      return;
    }
    this.working.set(true);
    try {
      await this.safetyCases.restoreAdminCase(this.publicReference);
      await this.load();
      this.snackbar.open($localize`Held state restored.`, undefined, {
        duration: 5000,
      });
    } catch (error) {
      this.showError(error, $localize`Could not restore the held state.`);
    } finally {
      this.working.set(false);
    }
  }

  private async loadSpot(detail: AdminSafetyCaseDetail): Promise<void> {
    const match = detail.case.subject.path?.match(/^spots\/([^/]+)$/u);
    if (!match) {
      this.spot.set(null);
      return;
    }
    try {
      this.spot.set(
        await this.spots.getSpotById(match[1] as SpotId, this.locale),
      );
    } catch {
      this.spot.set(null);
    }
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
