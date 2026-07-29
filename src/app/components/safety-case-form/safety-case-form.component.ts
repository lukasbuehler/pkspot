import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from "@angular/core";
import {
  FormField,
  email,
  form,
  maxLength,
  minLength,
  required,
  submit,
} from "@angular/forms/signals";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import type {
  SafetyCaseCategory,
  SafetyCaseSubjectSchema,
  SafetyCaseSubjectType,
  SafetyCaseType,
} from "../../../db/schemas/SafetyCaseSchema";
import {
  SafetyCasesService,
  type SubmitSafetyCaseResult,
} from "../../services/safety-cases.service";

@Component({
  selector: "app-safety-case-form",
  imports: [
    FormField,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: "./safety-case-form.component.html",
  styleUrl: "./safety-case-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SafetyCaseFormComponent {
  private readonly safetyCases = inject(SafetyCasesService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly locale = inject(LOCALE_ID);

  readonly preset = input<SafetyCaseFormPreset>({});
  readonly submitted = output<SubmitSafetyCaseResult>();
  readonly submitting = signal(false);

  readonly caseTypeOptions: readonly {
    value: Exclude<SafetyCaseType, "appeal">;
    label: string;
  }[] = [
    { value: "report", label: $localize`Report a safety concern` },
    { value: "complaint", label: $localize`Make a complaint` },
  ];
  readonly categoryOptions: readonly {
    value: SafetyCaseCategory;
    label: string;
  }[] = [
    { value: "child_safety", label: $localize`Child safety` },
    { value: "self_harm_or_suicide", label: $localize`Self-harm or suicide` },
    { value: "dangerous_activity", label: $localize`Dangerous activity` },
    { value: "sexual_content", label: $localize`Sexual content` },
    { value: "harassment_or_hate", label: $localize`Harassment or hate` },
    { value: "privacy_or_doxxing", label: $localize`Privacy or doxxing` },
    { value: "impersonation", label: $localize`Impersonation` },
    {
      value: "spam_or_malicious_link",
      label: $localize`Spam or a malicious link`,
    },
    {
      value: "unsafe_place_or_access",
      label: $localize`Unsafe place or access information`,
    },
    { value: "media_consent", label: $localize`Media consent` },
    { value: "illegal_content", label: $localize`Potentially illegal content` },
    { value: "reporting_access", label: $localize`Problem making a report` },
    { value: "report_handling", label: $localize`How a report was handled` },
    {
      value: "content_or_account_decision",
      label: $localize`Content or account decision`,
    },
    {
      value: "automated_media_decision",
      label: $localize`Automated media decision`,
    },
    {
      value: "age_assurance_decision",
      label: $localize`Age-assurance decision`,
    },
    {
      value: "safety_duty_compliance",
      label: $localize`Safety process or legal duty`,
    },
    { value: "privacy_or_data_use", label: $localize`Privacy or data use` },
    { value: "other_safety", label: $localize`Another safety concern` },
    { value: "other_service", label: $localize`Another service complaint` },
  ];
  readonly subjectTypeOptions: readonly {
    value: SafetyCaseSubjectType;
    label: string;
  }[] = [
    { value: "spot", label: $localize`Spot` },
    { value: "media", label: $localize`Photo or video` },
    { value: "profile", label: $localize`Public profile` },
    { value: "account", label: $localize`Account` },
    { value: "event", label: $localize`Event` },
    { value: "age_assurance", label: $localize`Age assurance` },
    { value: "service", label: $localize`PK Spot service` },
    { value: "other", label: $localize`Something else` },
  ];

  readonly formModel = linkedSignal(() => {
    const preset = this.preset();
    return {
      caseType: preset.caseType ?? ("report" as const),
      category: preset.category ?? ("other_safety" as const),
      subjectType: preset.subject?.type ?? ("service" as const),
      subjectPath: preset.subject?.path ?? "",
      subjectLabel: preset.subject?.label ?? "",
      subjectOwnerUid: preset.subject?.owner_uid ?? "",
      mediaSrc: preset.subject?.media_src ?? "",
      storagePath: preset.subject?.storage_path ?? "",
      summary: preset.summary ?? "",
      description: "",
      contactEmail: "",
    };
  });
  readonly caseForm = form(this.formModel, (fields) => {
    required(fields.caseType);
    required(fields.category);
    required(fields.subjectType);
    required(fields.summary, { message: $localize`Add a short summary.` });
    minLength(fields.summary, 5);
    maxLength(fields.summary, 140);
    required(fields.description, {
      message: $localize`Describe what happened and what outcome you need.`,
    });
    minLength(fields.description, 10);
    maxLength(fields.description, 4000);
    email(fields.contactEmail, {
      message: $localize`Enter a valid email address or leave it blank.`,
    });
  });

  submitCase(): void {
    submit(this.caseForm, async () => {
      if (this.submitting()) return;
      this.submitting.set(true);
      const value = this.formModel();
      try {
        const subject: SafetyCaseSubjectSchema = {
          type: value.subjectType,
          ...(value.subjectPath.trim()
            ? { path: value.subjectPath.trim() }
            : {}),
          ...(value.subjectLabel.trim()
            ? { label: value.subjectLabel.trim() }
            : {}),
          ...(value.subjectOwnerUid.trim()
            ? { owner_uid: value.subjectOwnerUid.trim() }
            : {}),
          ...(value.mediaSrc.trim()
            ? { media_src: value.mediaSrc.trim() }
            : {}),
          ...(value.storagePath.trim()
            ? { storage_path: value.storagePath.trim() }
            : {}),
        };
        const result = await this.safetyCases.submit({
          case_type: value.caseType,
          category: value.category,
          subject,
          summary: value.summary.trim(),
          description: value.description.trim(),
          ...(value.contactEmail.trim()
            ? { contact_email: value.contactEmail.trim() }
            : {}),
          locale: this.locale,
        });
        this.submitted.emit(result);
      } catch (error) {
        console.error("Could not submit safety case", error);
        this.snackbar.open(
          error instanceof Error
            ? error.message
            : $localize`Could not submit this case. Please try again.`,
          $localize`Dismiss`,
          { duration: 7000 },
        );
      } finally {
        this.submitting.set(false);
      }
    });
  }
}

export interface SafetyCaseFormPreset {
  caseType?: Exclude<SafetyCaseType, "appeal">;
  category?: SafetyCaseCategory;
  subject?: SafetyCaseSubjectSchema;
  summary?: string;
}
